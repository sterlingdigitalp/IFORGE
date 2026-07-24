#!/usr/bin/env node
// Graduate age-variant winners into immutable hashed canonicals (+ depicted_age sidecars)
// and deliver them to Director Desk via add_references (new hash => new reference, never a
// duplicate character; re-ingest_character WOULD duplicate — see DD confirmation).
//
// Passes DD's native age_in_reference field (= depicted_age) AND the sidecar, so DD's
// "Reference age" slot populates either way.
//
// Usage:
//   node scripts/deliver-variants.mjs --graduate-only        # create hashed canonicals + sidecars, no POST
//   node scripts/deliver-variants.mjs --deliver [--only charles_darwin]  # + POST to DD
//   env: DIRECTORDESK_URL (default http://localhost:3457), DIRECTORDESK_PROJECT_ROOT override

import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VAR = path.join(ROOT, "tmp", "grok-spike", "variants");
const DD_URL = (process.env.DIRECTORDESK_URL || "http://localhost:3457").replace(/\/+$/, "");

// The 20 pilot winners. OLD = DD-named human-review picks; YOUNG = re-roll c1 (DD cosine
// gate confirms/reselects among c1-c3). depicted_age = true apparent age.
const WINNERS = [
  // slug, name, kind, candidateFile, depicted_age
  ["charles_darwin","Charles Darwin","old","charles_darwin__age68__c3.jpg",68],
  ["charles_darwin","Charles Darwin","young","charles_darwin__age25__c1.jpg",25],
  ["galileo_galilei","Galileo Galilei","old","galileo_galilei__age70__c2.jpg",70],
  ["galileo_galilei","Galileo Galilei","young","galileo_galilei__age28__c1.jpg",28],
  ["nicolaus_copernicus","Nicolaus Copernicus","old","nicolaus_copernicus__age70__c2.jpg",70],
  ["nicolaus_copernicus","Nicolaus Copernicus","young","nicolaus_copernicus__age30__c1.jpg",30],
  ["antoni_van_leeuwenhoek","Antoni van Leeuwenhoek","old","antoni_van_leeuwenhoek__age75__c2.jpg",75],
  ["antoni_van_leeuwenhoek","Antoni van Leeuwenhoek","young","antoni_van_leeuwenhoek__age32__c1.jpg",32],
  ["archimedes","Archimedes","old","archimedes__age72__c2.jpg",72],
  ["archimedes","Archimedes","young","archimedes__age30__c1.jpg",30],
  ["william_gilbert","William Gilbert","old","william_gilbert__age58__c2.jpg",58],
  ["william_gilbert","William Gilbert","young","william_gilbert__age32__c1.jpg",32],
  ["al_khwarizmi","Al-Khwarizmi","old","al_khwarizmi__age65__c2.jpg",65],
  ["al_khwarizmi","Al-Khwarizmi","young","al_khwarizmi__age28__c1.jpg",28],
  ["euclid","Euclid","old","euclid__age65__c2.jpg",65],
  ["euclid","Euclid","young","euclid__age28__c1.jpg",28],
  ["ibn_al_haytham","Ibn al-Haytham","old","ibn_al_haytham__age68__c3.jpg",68],
  ["ibn_al_haytham","Ibn al-Haytham","young","ibn_al_haytham__age30__c1.jpg",30],
  ["johannes_gutenberg","Johannes Gutenberg","old","johannes_gutenberg__age65__c1.jpg",65],
  ["johannes_gutenberg","Johannes Gutenberg","young","johannes_gutenberg__age30__c1.jpg",30],
];

function die(m) { console.error(`\n✗ ${m}\n`); process.exit(1); }

async function pkgVersion() {
  try { return JSON.parse(await fs.readFile(path.join(ROOT, "package.json"), "utf8")).version || "unknown"; }
  catch { return "unknown"; }
}

// Graduate: copy candidate into characters/<slug>/variants/, hashed + immutable, with sidecar.
async function graduate(w, appVersion) {
  const [slug, name, kind, file, age] = w;
  const src = path.join(VAR, file);
  try { await fs.access(src); } catch { die(`missing candidate: ${src}`); }
  const dir = path.join(ROOT, "characters", slug, "variants");
  await fs.mkdir(dir, { recursive: true });
  // Grok emits JPEG; convert to real PNG so magic bytes match the .png name (DD content-sniffs
  // and rejects a jpeg-in-.png). Matches the primary canonicals (approve does copy_as_png).
  const staging = path.join(dir, `.staging-${kind}.png`);
  execFileSync("sips", ["-s", "format", "png", src, "--out", staging], { stdio: "ignore" });
  const bytes = await fs.readFile(staging);
  const sha = crypto.createHash("sha256").update(bytes).digest("hex");
  const hashed = `canonical-${sha.slice(0, 12)}.png`;
  const imgPath = path.join(dir, hashed);
  await fs.rename(staging, imgPath);
  const sidecarPath = `${imgPath}.canonical.json`;
  // immutability: if the sidecar exists, its version must match (never overwrite silently)
  const existing = await fs.readFile(sidecarPath, "utf8").then(JSON.parse).catch(() => null);
  if (existing && existing.version !== sha) die(`immutability: ${sidecarPath} version mismatch`);
  const sidecar = {
    schema_version: "canonical_image.v1",
    character_name: name,
    depicted_age: age,
    version: sha,
    created_by: { app: "identity-forge", version: appVersion },
    provenance: `Age variant (apparent age ${age}, ${kind}) forged from the primary canonical via forge-age-variants.mjs — star-topology edit-from-canonical; age-variant pilot 2026-07-24`,
    license: "TODO: usage rights not yet designated",
  };
  await fs.writeFile(sidecarPath, JSON.stringify(sidecar, null, 2) + "\n");
  return { slug, name, kind, age, sha, imgPath, sidecarPath, bytes };
}

async function deliver(g) {
  const projectRoot = process.env.DIRECTORDESK_PROJECT_ROOT || g.slug;
  const form = new FormData();
  form.append("action", "add_references");
  form.append("project_root", projectRoot);
  form.append("character_id", `char_${g.slug}`);
  form.append("reference_type", "mixed");
  form.append("age_in_reference", String(g.age)); // DD-native field → "Reference age"
  form.append("files", new Blob([g.bytes], { type: "image/png" }), path.basename(g.imgPath));
  const sidecarJson = await fs.readFile(g.sidecarPath, "utf8");
  form.append("sidecar", new Blob([sidecarJson], { type: "application/json" }), `${path.basename(g.imgPath)}.canonical.json`);

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 120_000);
  let res, body;
  try {
    res = await fetch(`${DD_URL}/api/characters`, { method: "POST", body: form, signal: ctrl.signal });
    body = await res.json().catch(() => ({}));
  } catch (e) { clearTimeout(t); return { ok: false, error: ctrl.signal.aborted ? "timeout" : e.message }; }
  clearTimeout(t);
  if (res.status !== 200) return { ok: false, status: res.status, error: body?.error || JSON.stringify(body).slice(0, 160) };
  return { ok: true, warnings: body?.warnings || [] };
}

async function main() {
  const argv = process.argv.slice(2);
  const doDeliver = argv.includes("--deliver");
  const onlyIdx = argv.indexOf("--only");
  const only = onlyIdx >= 0 ? new Set(argv[onlyIdx + 1].split(",")) : null;
  const appVersion = await pkgVersion();

  let items = WINNERS;
  if (only) items = items.filter((w) => only.has(w[0]));
  console.log(`Age-variant delivery — ${items.length} variant(s)  mode=${doDeliver ? `DELIVER → ${DD_URL}` : "graduate-only"}\n`);

  const graduated = [];
  for (const w of items) {
    const g = await graduate(w, appVersion);
    console.log(`  graduated ${g.slug}/${g.kind} age ${g.age} → variants/${path.basename(g.imgPath)} (sha ${g.sha.slice(0, 12)})`);
    graduated.push(g);
  }
  if (!doDeliver) { console.log(`\n✓ Graduated ${graduated.length}. Re-run with --deliver to POST to DD.`); return; }

  console.log("");
  let ok = 0;
  for (const g of graduated) {
    process.stdout.write(`  → deliver ${g.slug}/${g.kind} (age ${g.age}) … `);
    const r = await deliver(g);
    if (r.ok) { ok++; console.log(`✓ 200${r.warnings.length ? ` (warnings: ${r.warnings.join("; ")})` : ""}`); }
    else console.log(`✗ ${r.status || ""} ${r.error}`);
  }
  console.log(`\n${ok}/${graduated.length} delivered to DD.`);
}

main().catch((e) => die(`Unexpected: ${e.stack || e.message}`));
