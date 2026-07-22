#!/usr/bin/env node
// Delivers an approved character's canonical image to Director Desk over HTTP,
// per /Users/sterlingdigital/directordesk/CANONICAL_IMAGE_CONTRACT.md.
//
// Usage: node scripts/export-canonical.mjs <slug> [--url <url>] [--project-root <path>]
//        [--reference-type <type>] [--character-id <id>] [--dry-run]

import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { preflightCanonicalImage } = require("./dd-preflight.js");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHARACTERS_DIR = path.join(ROOT, "characters");
const REFERENCE_TYPES = new Set(["photograph", "painting", "engraving_print", "bust_sculpture", "mixed"]);
const PREFLIGHT_TIMEOUT_MS = 60000;
const INGEST_TIMEOUT_MS = 120000;

function usage() {
  console.error("Usage: node scripts/export-canonical.mjs <slug> [--url <url>] [--project-root <path>] [--reference-type <type>] [--character-id <id>] [--dry-run]");
}

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { slug: undefined, url: undefined, projectRoot: undefined, referenceType: "mixed", characterId: undefined, dryRun: false };
  const rest = [...argv];
  const positional = [];
  while (rest.length > 0) {
    const arg = rest.shift();
    switch (arg) {
      case "--url":
        args.url = rest.shift();
        break;
      case "--project-root":
        args.projectRoot = rest.shift();
        break;
      case "--reference-type":
        args.referenceType = rest.shift();
        break;
      case "--character-id":
        args.characterId = rest.shift();
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      default:
        positional.push(arg);
        break;
    }
  }
  args.slug = positional[0];
  return args;
}

function sha256Hex(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

async function readStateCharacterName(dir) {
  const statePath = path.join(dir, "STATE.md");
  try {
    const text = await fs.readFile(statePath, "utf8");
    const match = text.match(/^Character:\s*(.*)$/m);
    if (match && match[1].trim()) return match[1].trim();
  } catch {
    // fall through
  }
  return undefined;
}

async function readJson(filePath) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function utcTimestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

async function ensureHashedCanonical(dir, slug, stateCharacterName) {
  const canonicalPath = path.join(dir, "canonical.png");
  let bytes;
  try {
    bytes = await fs.readFile(canonicalPath);
  } catch {
    fail(`canonical.png not found for this character: ${canonicalPath}. Approve the character first.`);
  }

  const sha256 = sha256Hex(bytes);
  const sha12 = sha256.slice(0, 12);
  const hashedName = `canonical-${sha12}.png`;
  const hashedPath = path.join(dir, hashedName);
  const sidecarPath = `${hashedPath}.canonical.json`;

  const hashedExists = await fs.access(hashedPath).then(() => true).catch(() => false);
  const sidecarExists = await fs.access(sidecarPath).then(() => true).catch(() => false);

  if (!hashedExists) {
    await fs.writeFile(hashedPath, bytes);
  }

  let characterName = stateCharacterName;

  if (sidecarExists) {
    const existing = await readJson(sidecarPath);
    if (!existing || existing.version !== sha256) {
      fail(
        `immutability violation: sidecar ${sidecarPath} has version "${existing?.version ?? "(unreadable)"}" ` +
        `but canonical.png hashes to "${sha256}". Refusing to overwrite. Investigate before exporting.`
      );
    }
    // STATE.md is missing/blank -> fall back to the name already recorded on the sidecar.
    if (!characterName && existing.character_name) characterName = existing.character_name;
  } else {
    if (!characterName) characterName = slug;
    let appVersion = "unknown";
    const pkg = await readJson(path.join(ROOT, "package.json"));
    if (pkg && pkg.version) appVersion = pkg.version;

    const sidecar = {
      schema_version: "canonical_image.v1",
      character_name: characterName,
      version: sha256,
      created_by: {
        app: "identity-forge",
        version: appVersion
      },
      provenance: "Backfilled at export from canonical.png",
      license: "TODO: usage rights not yet designated"
    };
    await fs.writeFile(sidecarPath, JSON.stringify(sidecar, null, 2) + "\n");
  }

  if (!characterName) characterName = slug;

  return { bytes, sha256, sha12, hashedName, hashedPath, sidecarPath, characterName };
}

async function postWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.slug) {
    usage();
    process.exit(1);
  }

  const referenceType = args.referenceType || "mixed";
  if (!REFERENCE_TYPES.has(referenceType)) {
    fail(`invalid --reference-type "${referenceType}"; must be one of ${[...REFERENCE_TYPES].join(", ")}`);
  }

  const directordeskUrl = args.url || process.env.DIRECTORDESK_URL;
  if (!directordeskUrl) {
    fail("DIRECTORDESK_URL is not set (env var or --url). Export requires a Director Desk destination.");
  }
  const baseUrl = directordeskUrl.replace(/\/+$/, "");

  const projectRoot = args.projectRoot || process.env.DIRECTORDESK_PROJECT_ROOT;
  if (!projectRoot) {
    fail("Director Desk project root is not set (env DIRECTORDESK_PROJECT_ROOT or --project-root). The ingest API requires it.");
  }

  const slug = args.slug;
  const dir = path.join(CHARACTERS_DIR, slug);
  const dirExists = await fs.access(dir).then(() => true).catch(() => false);
  if (!dirExists) fail(`character directory not found: ${dir}`);

  const stateCharacterName = await readStateCharacterName(dir);
  const { bytes, sha256, sha12, hashedName, characterName } = await ensureHashedCanonical(dir, slug, stateCharacterName);

  // Pre-flight: format + face check against Director Desk. Errors abort; warnings
  // are printed and export continues. A skip (endpoint unreachable, etc.) also
  // continues — the ingest endpoint below revalidates authoritatively.
  const preflight = await preflightCanonicalImage(bytes, hashedName, {
    baseUrl,
    timeoutMs: PREFLIGHT_TIMEOUT_MS
  });

  if (preflight.status === "skipped") {
    console.log(`Pre-flight skipped: ${preflight.reason}`);
  } else {
    console.log(`Pre-flight: ${preflight.status}`);
  }
  if (preflight.warnings.length > 0) {
    console.log("Pre-flight warnings:");
    for (const warning of preflight.warnings) console.log(`- ${warning}`);
  }
  if (preflight.errors.length > 0) {
    console.error("Pre-flight errors:");
    for (const error of preflight.errors) console.error(`- ${error}`);
    process.exit(1);
  }

  if (args.dryRun) {
    console.log(`Dry run OK: ${characterName} (${slug}) canonical ${hashedName} passed pre-flight; ingest skipped.`);
    process.exit(0);
  }

  const action = args.characterId ? "add_references" : "ingest_character";

  const sidecarJson = await fs.readFile(path.join(dir, `${hashedName}.canonical.json`), "utf8");

  const form = new FormData();
  form.append("action", action);
  form.append("project_root", projectRoot);
  if (args.characterId) {
    form.append("character_id", args.characterId);
  } else {
    form.append("character_name", characterName);
  }
  form.append("reference_type", referenceType);
  // CRITICAL: only the hashed canonical image goes in `files`. Director Desk
  // content-sniffs every `files` entry as an image and would reject the whole
  // request if the JSON sidecar were appended there too.
  form.append("files", new Blob([bytes], { type: "image/png" }), hashedName);
  form.append("sidecar", new Blob([sidecarJson], { type: "application/json" }), `${hashedName}.canonical.json`);

  let response;
  try {
    response = await postWithTimeout(`${baseUrl}/api/characters`, { method: "POST", body: form }, INGEST_TIMEOUT_MS);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`could not reach Director Desk at ${baseUrl}: ${detail}`);
  }

  let body;
  try {
    body = await response.json();
  } catch (error) {
    fail(`Director Desk returned an unparseable response (HTTP ${response.status})`);
  }

  if (response.status !== 200) {
    const errorText = typeof body?.error === "string" ? body.error : JSON.stringify(body);
    console.error(`Export failed: Director Desk returned HTTP ${response.status}: ${errorText}`);
    if (/already exists|duplicate/i.test(errorText)) {
      console.error("Hint: if this character already exists in Director Desk, re-run with --character-id <id> to use add_references instead.");
    }
    process.exit(1);
  }

  const receiptDir = path.join(dir, "export");
  await fs.mkdir(receiptDir, { recursive: true });
  const receiptPath = path.join(receiptDir, `export-${sha12}-${utcTimestamp()}.json`);
  const receipt = {
    schema_version: "iforge_export.v1",
    slug,
    character_name: characterName,
    canonical_image: hashedName,
    sha256,
    exported_at: new Date().toISOString(),
    directordesk_url: baseUrl,
    project_root: projectRoot,
    action,
    reference_type: referenceType,
    preflight: { status: preflight.status, warnings: preflight.warnings },
    response: body
  };
  await fs.writeFile(receiptPath, JSON.stringify(receipt, null, 2) + "\n");

  console.log(`exported: ${characterName} (${slug})`);
  console.log(`canonical: characters/${slug}/${hashedName}`);
  console.log(`destination: ${baseUrl} (${action})`);
  if (Array.isArray(body?.warnings) && body.warnings.length > 0) {
    console.log("Director Desk warnings:");
    for (const warning of body.warnings) console.log(`- ${warning}`);
  }
  console.log(`receipt: characters/${slug}/export/${path.basename(receiptPath)}`);

  process.exit(0);
}

main().catch((error) => {
  const detail = error instanceof Error ? (error.stack || error.message) : String(error);
  console.error(`Unexpected error: ${detail}`);
  process.exit(1);
});
