import { promises as fs } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const ROOT = "/Users/sterlingdigital/IFORGE";
const PILOT = new Set(["euclid","archimedes","al_khwarizmi","ibn_al_haytham","johannes_gutenberg",
  "nicolaus_copernicus","galileo_galilei","antoni_van_leeuwenhoek","william_gilbert","charles_darwin"]);

// Lifespans from the roster spreadsheet: "Name (1809–1882)" / "Name (~287–212 BCE)".
const xml = execSync(`unzip -p "${ROOT}/TOP 120.xlsx" xl/sharedStrings.xml`).toString();
const strings = [...xml.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map(m => m[1]);
const norm = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");

const life = new Map();
// Names the spreadsheet parse missed. Three of these MATTER: without them Banting,
// Ibn Sina and Newcomen would be aged past their own death year.
for (const [n, age] of [["Francis Crick",88],["Frederick Banting",49],["Ibn Sina",57],
                        ["Jack Kilby",82],["Joseph-Michel Montgolfier",70],["Thomas Newcomen",65]])
  life.set(norm(n), { name: n, age });
for (const s of strings) {
  for (const seg of s.split("\t")) {
    // "Name (dates)" — dates may be BCE (descending) or CE (ascending), with ~ and b. forms
    const m = seg.match(/^([^()\n]{3,60}?)\s*\((?:~|c\.)?\s*(\d{3,4})\s*(BCE|CE)?\s*[–\-—]\s*(?:~|c\.)?(\d{3,4})\s*(BCE|CE)?\)/);
    if (!m) continue;
    const [, nameRaw, aRaw, aEra, bRaw, bEra] = m;
    const a = +aRaw, b = +bRaw;
    const bce = /BCE/.test(aEra || "") || /BCE/.test(bEra || "") || a > b;
    const age = bce ? a - b : b - a;
    if (age > 5 && age < 110) {
      const k = norm(nameRaw);
      if (k && !life.has(k)) life.set(k, { name: nameRaw.trim(), age });
    }
  }
}

const dirs = (await fs.readdir(path.join(ROOT, "characters"), { withFileTypes: true }))
  .filter(e => e.isDirectory()).map(e => e.name).sort();

const rows = [];
for (const slug of dirs) {
  if (PILOT.has(slug)) continue;
  const cdir = path.join(ROOT, "characters", slug);
  const scName = (await fs.readdir(cdir)).find(f => /^canonical-[0-9a-f]{12}\.png\.canonical\.json$/.test(f));
  const meta = JSON.parse(await fs.readFile(path.join(cdir, scName), "utf8"));
  const anchor = Number(meta.depicted_age);

  // match on normalized name, then on surname
  const k = norm(meta.character_name);
  let hit = life.get(k);
  if (!hit) {
    const surname = norm(meta.character_name.split(" ").slice(-1)[0]);
    for (const [lk, v] of life) if (lk.endsWith(surname) && surname.length > 4) { hit = v; break; }
  }
  const died = hit?.age ?? null;

  // DD's pilot pattern: a believable elder age, capped short of death.
  let target = anchor + 20;
  if (died != null) target = Math.min(target, died - 1);
  target = Math.round(target);

  const span = target - anchor;
  const skip = span < 8;                      // too little range to be a distinct reference
  rows.push({ slug, name: meta.character_name, anchor, died, target, span, skip });
}

const go = rows.filter(r => !r.skip), no = rows.filter(r => r.skip);
console.log(`OLD-variant targets for the remaining ${rows.length}\n`);
console.log(`GENERATE (${go.length}):`);
for (const r of go) console.log(`   ${r.name.padEnd(25)} ${String(r.anchor).padStart(2)} -> ${String(r.target).padStart(2)}  (+${r.span})${r.died ? `  died ${r.died}` : "  [no lifespan found]"}`);
console.log(`\nSKIP — died too young for a distinct elder reference (${no.length}):`);
for (const r of no) console.log(`   ${r.name.padEnd(25)} anchor ${r.anchor}, died ${r.died} -> only +${r.span}`);
console.log(`\nno lifespan matched: ${rows.filter(r => r.died == null).map(r => r.name).join(", ") || "(none)"}`);

await fs.writeFile(path.join(ROOT, "tmp/grok-spike/old-targets.json"),
  JSON.stringify({ schema: "iforge_old_targets.v1", rule: "target = min(anchor+20, died-1); skip if span < 8", rows }, null, 2) + "\n");
