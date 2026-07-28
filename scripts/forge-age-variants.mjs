#!/usr/bin/env node
// Age-variant forge — generates age-shifted references for a locked canonical, for
// Director Desk's age-matched PuLID selection. STAR TOPOLOGY: every variant is an edit
// of the character's own approved canonical.png (never the historical source, never
// chained young->old), so both variants inherit the same locked face geometry. The
// house-style block is extracted verbatim from the frozen canonical generator so
// variants are framing/style-interchangeable with the primary canonical.
//
// Identity is NOT guaranteed by a seed (Grok edits expose none) — it is MEASURED after
// the fact by InsightFace antelopev2 cosine (DD's stack), the accept gate. This tool only
// generates candidates + a 3-age contact sheet for review; gating/approval is downstream.
//
// Auth: OAuth bearer from ~/.grok/auth.json (subscription only, never an API key).
// Usage:
//   node scripts/forge-age-variants.mjs --dry-run            # print prompts+sources, no API calls, no cost
//   node scripts/forge-age-variants.mjs [--candidates 3]     # generate the pilot set
//   node scripts/forge-age-variants.mjs --only darwin,euclid # subset by slug

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API_BASE = (process.env.XAI_API_BASE || "https://api.x.ai/v1").replace(/\/+$/, "");
const AUTH_PATH = process.env.GROK_AUTH_PATH || path.join(os.homedir(), ".grok", "auth.json");
const MODEL = process.env.XAI_IMAGE_MODEL || "grok-imagine-image-quality";
const TIMEOUT_MS = 120_000;
const TICKS_PER_USD = 1e9;
const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

// DD-supplied pilot: slug -> { name, base, targets:[young, old], youngNote?, oldNote? }.
// base = current canonical depicted_age. youngNote/oldNote = per-character historical
// feature corrections, needed where the mid-life anchor has sticky age-markers (heavy
// beard, baldness) the model won't shed on its own — the pilot's key finding.
const PILOT = {
  euclid:                 { name: "Euclid",                  base: 48, targets: [28, 65],
    // v2b concrete-cue pass: hairline recession + beard bulk + forehead lines were the
    // remaining age markers at +6.
    youngNote: "thick hair growing full and low across the entire hairline with NO recession at the temples and no high bared forehead; the beard cropped very close and short against the jawline rather than full; a completely smooth unlined forehead with no horizontal creases at all and no vertical lines between the brows; no hollowing beneath the cheekbones" },
  archimedes:             { name: "Archimedes",              base: 55, targets: [30, 72],
    // v2b concrete-cue pass: beard bulk + persistent brow lines were the age markers at +4.
    youngNote: "keep the dark curly hair, but crop the beard very close and short against the jawline rather than full and bushy; a completely smooth unlined forehead with no horizontal creases at all and no vertical lines between the brows; smooth skin beneath the eyes with no bags; no hollowing beneath the cheekbones" },
  al_khwarizmi:           { name: "Al-Khwarizmi",            base: 45, targets: [28, 65],
    // v2b concrete-cue pass: residual beard bulk + brow creases at +5.
    youngNote: "the dark beard cropped very close and short against the jawline, barely more than heavy stubble, rather than full; a completely smooth unlined forehead with no horizontal creases at all and no vertical lines between the brows; smooth full cheeks with no hollowing beneath the cheekbones" },
  ibn_al_haytham:         { name: "Ibn al-Haytham",          base: 45, targets: [30, 68],
    youngNote: "a short, tightly-trimmed dark beard rather than a long full one" },
  johannes_gutenberg:     { name: "Johannes Gutenberg",      base: 48, targets: [30, 65],
    youngNote: "COMPLETELY CLEAN-SHAVEN with NO beard and NO moustache (his beard came later in life)" },
  nicolaus_copernicus:    { name: "Nicolaus Copernicus",     base: 42, targets: [30, 70],
    // v2b: "noticeably shorter hair" was ignored twice — replaced with a concrete cut, and
    // cheek HOLLOWING added as an explicit age tell (a young face keeps soft cheek fullness;
    // fullness is not slimming/beautifying, so it does not fight the structure lock).
    youngNote: "clean-shaven as in the reference; hair cut CLOSE and SHORT — cropped above the ears and above the collar, clearly and obviously shorter than the reference's long shoulder-length hair; completely smooth cheeks with NO lines running from the nose down to the corners of the mouth and NO hollowing beneath the cheekbones, since a young man's face still carries soft fullness in the cheeks" },
  galileo_galilei:        { name: "Galileo Galilei",         base: 45, targets: [28, 70],
    // v2b concrete-cue pass: stubble + hairline + persistent brow creases at +5. DD's
    // direction for Galileo was wrinkles only, so the beard is reduced, not removed.
    youngNote: "thick dark auburn hair growing full and low across the entire hairline with NO recession at the temples; the beard reduced to a very close-cropped short beard against the jawline, not full; a completely smooth unlined forehead with no horizontal creases at all and no vertical lines between the brows; smooth skin beneath the eyes with no bags or shadows; no hollowing beneath the cheekbones" },
  antoni_van_leeuwenhoek: { name: "Antoni van Leeuwenhoek",  base: 48, targets: [32, 75],
    youngNote: "clean-shaven as in the reference, with noticeably SHORTER hair than the reference — shorter hair is the primary youth cue here" },
  william_gilbert:        { name: "William Gilbert",         base: 48, targets: [32, 58],
    youngNote: "COMPLETELY CLEAN-SHAVEN — remove the goatee and all facial hair entirely (keep the fuller head hair); this reads instantly more boyish" },
  charles_darwin:         { name: "Charles Darwin",          base: 52, targets: [25, 68],
    youngNote: "COMPLETELY CLEAN-SHAVEN with NO beard and NO moustache, and a full head of dark brown hair with no balding (Darwin was beardless with full hair in his twenties)" },
};

function die(m) { console.error(`\n✗ ${m}\n`); process.exit(1); }

// Pull the EXACT frozen house-style block from the canonical generator (no import: its
// main() self-executes). vm-sandbox eval of just the STYLE_PROMPT declaration.
async function loadStylePrompt() {
  const src = await fs.readFile(path.join(ROOT, "scripts", "spike-grok-image.mjs"), "utf8");
  const m = src.match(/const STYLE_PROMPT = \(identity\) =>[\s\S]*?;\n/);
  if (!m) die("could not extract STYLE_PROMPT from spike-grok-image.mjs");
  const ctx = {}; vm.createContext(ctx);
  // const in a vm script is block-scoped (not a ctx property); the trailing expression
  // makes the script's completion value the function itself.
  const fn = vm.runInContext(m[0] + "STYLE_PROMPT;", ctx);
  if (typeof fn !== "function") die("STYLE_PROMPT did not resolve to a function");
  return fn;
}

// The variant identity cue. Leans HARD on same-person because that is the non-negotiable;
// varies ONLY apparent age + age-appropriate hair/skin. The house-style block wraps this.
function variantIdentity(name, target, base, note, noLock, era, hair) {
  const younger = target < base;
  // Younger: on stylized faces the youth signal is carried by WRINKLE REDUCTION and
  // HAIR/BEARD LENGTH, not skin tone (DD review finding). The single biggest "too old"
  // tell is retained forehead lines, glabellar (between-brow) creases, and under-eye bags —
  // kill those explicitly. Beard/hair specifics come from the per-character note.
  // CHILD band: a child is not a smoothed adult — the skull proportions genuinely differ.
  // Identity here can only ride on colouring and the few stable features (eye colour/shape,
  // hair, ear set); brow/jaw/nose are undeveloped at this age by definition.
  if (younger && target <= 14) {
    return (
      `${name} as a CHILD of about ${target} years old — recognisably the same individual in childhood, ` +
      `the same eye colour and eye shape, the same ear shape and set, ` +
      (hair ? `${hair}, ` : `the same hair colour and hairline pattern as the reference, `) +
      `the same skin tone and overall cast of the face as the adult reference. ` +
      `Render true child proportions, NOT a miniature adult: a proportionally larger cranium, a smaller and softer lower face, ` +
      `large clear eyes set relatively low in the face, a small soft undeveloped nose, a rounded chin and jaw with no adult jaw width, ` +
      `NO brow ridge, full round cheeks, and completely smooth unlined child skin. ` +
      (era ? `Wearing ${era}. ` : "") +
      `Plain neutral background, head-and-shoulders, near-frontal with eyes to camera.`
    );
  }
  const delta = younger
    ? "a distinctly younger face achieved ONLY by smoothing skin and by hair — specifically NO forehead lines, NO vertical glabellar creases between the eyebrows, NO under-eye bags or lines, NO nasolabial folds, NO marionette lines, and no jowls or sagging along the jaw, together with smooth taut youthful skin and a fuller head of darker hair with no grey and no balding or receding hairline"
    : "more lined and weathered older skin, thinner and greyer or white hair and beard, and an older, more settled bearing";
  // The identity-vs-age tradeoff (DD gate, 2026-07-27): Darwin's two FAILING young
  // candidates were the ones that looked youngest — they de-aged by genericizing the bone
  // structure (lost his heavy brow and strong nose), so antelopev2 matched another
  // character's anchor better. The passing candidate kept the structure. So youth must be
  // spent on skin and hair ONLY; naming the load-bearing structures protects identity.
  const structureLock = (younger && !noLock)
    ? "CRITICAL: keep the EXACT same distinctive bone structure as the reference — the same brow ridge and its heaviness, the same nose size and shape, the same jaw width, the same eye spacing and eye set, the same face length and cheekbones. The youth must come ONLY from smoother skin, fewer lines, and fuller darker hair. Do NOT slim, soften, prettify, regularize or make the face more conventionally handsome: a de-aged face whose structure has been smoothed into a generic handsome young man IS A DIFFERENT PERSON and is a failure. "
    : "";
  return (
    `${name} — THE EXACT SAME PERSON shown in the reference image, with the identical unmistakable facial identity: ` +
    `same face shape, same eyes, nose, brow, and bone structure, same defining identity cues. ` +
    `Depict this same individual convincingly at approximately ${target} years old, with ${delta}. ` +
    (note ? `${note}. ` : "") +
    structureLock +
    `This MUST clearly read as ${target} years old AND unmistakably the same person — preserve the facial geometry and identity exactly while changing apparent age and age-appropriate hair. ` +
    `keep the same wardrobe style, framing, and plain neutral background as the reference`
  );
}

async function loadToken() {
  let json;
  try { json = JSON.parse(await fs.readFile(AUTH_PATH, "utf8")); }
  catch { die(`Could not read ${AUTH_PATH}. Is the Grok CLI logged in? Run: grok`); }
  const looksJwt = (s) => typeof s === "string" && s.split(".").length === 3 && s.length > 40;
  const strings = [];
  (function walk(o, keys = []) {
    if (!o || typeof o !== "object") return;
    for (const [k, v] of Object.entries(o)) {
      const kp = [...keys, k];
      if (typeof v === "string") strings.push({ field: kp.join("."), value: v, jwt: looksJwt(v) });
      else if (v && typeof v === "object") walk(v, kp);
    }
  })(json);
  const cands = strings
    .filter((s) => s.value.length > 40 && !/refresh|id_token/i.test(s.field) && (s.jwt || /access|token|bearer|jwt|credential|session|key/i.test(s.field)))
    .sort((a, b) => (b.jwt - a.jwt) || (b.value.length - a.value.length));
  if (!cands.length) die(`No access-token-like field in ${AUTH_PATH}.`);
  console.log(`  auth: field "${cands[0].field}" (${cands[0].jwt ? "JWT" : "opaque"})`);
  return cands[0].value;
}

function sniffExt(b) {
  if (b.slice(0, 8).toString("hex") === "89504e470d0a1a0a") return "png";
  if (b[0] === 0xff && b[1] === 0xd8) return "jpg";
  if (b.slice(0, 4).toString("ascii") === "RIFF" && b.slice(8, 12).toString("ascii") === "WEBP") return "webp";
  return "bin";
}

async function request(token, body) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), TIMEOUT_MS);
  let res, text;
  try {
    res = await fetch(`${API_BASE}/images/edits`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: c.signal,
    });
    text = await res.text();
  } catch (e) { clearTimeout(t); return { ok: false, error: c.signal.aborted ? "timeout" : e.message, ticks: 0 }; }
  clearTimeout(t);
  if (res.status === 401) die("401 — Grok token expired. Re-run `grok`, then retry.");
  const ticks = (text.match(/cost_in_usd_ticks"?\s*:\s*(\d+)/) || [])[1] | 0;
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 140)}`, moderated: /content-moderated/i.test(text), ticks };
  let p; try { p = JSON.parse(text); } catch { return { ok: false, error: "unparseable", ticks }; }
  const items = p.data || p.images || [];
  return items.length ? { ok: true, item: items[0], ticks } : { ok: false, error: "no image", ticks };
}

async function saveImage(item, base) {
  let buf;
  if (item?.b64_json) buf = Buffer.from(item.b64_json, "base64");
  else if (item?.url) { const r = await fetch(item.url); buf = Buffer.from(await r.arrayBuffer()); }
  else die("response had neither b64_json nor url");
  const ext = sniffExt(buf) === "bin" ? "img" : sniffExt(buf);
  const dest = `${base}.${ext}`;
  await fs.writeFile(dest, buf);
  return { dest, ext };
}

async function embed(p) {
  try { const b = await fs.readFile(p); const e = sniffExt(b) === "bin" ? path.extname(p).slice(1) : sniffExt(b); return `data:${MIME[e] || "image/jpeg"};base64,${b.toString("base64")}`; }
  catch { return null; }
}

function parseArgs(argv) {
  const a = { dryRun: false, candidates: 3, only: null, youngOnly: false, oldOnly: false, out: null, targets: null, noLock: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dry-run") a.dryRun = true;
    else if (argv[i] === "--candidates") a.candidates = Math.max(1, Number(argv[++i]) || 3);
    else if (argv[i] === "--only") a.only = new Set(argv[++i].split(",").map((s) => s.trim().toLowerCase()));
    else if (argv[i] === "--young-only") a.youngOnly = true;
    else if (argv[i] === "--old-only") a.oldOnly = true;
    else if (argv[i] === "--out") a.out = argv[++i];
    else if (argv[i] === "--targets") a.targets = argv[++i];
    else if (argv[i] === "--no-lock") a.noLock = true;
  }
  return a;
}

// The younger target is the smaller of the two.
function selectTargets(targets, args) {
  if (args.youngOnly) return [Math.min(...targets)];
  if (args.oldOnly) return [Math.max(...targets)];
  return targets;
}

// Log spend to the same meter the cast generator uses, so one file holds total spend.
async function recordUsage(runTicks, calls) {
  const p = path.join(ROOT, "tmp", "grok-spike", "usage.json");
  let data = { cumulative_ticks: 0, runs: [] };
  try { data = JSON.parse(await fs.readFile(p, "utf8")); } catch { }
  data.cumulative_ticks = (data.cumulative_ticks || 0) + runTicks;
  data.runs.push({ at: new Date().toISOString(), ticks: runTicks, calls, tool: "forge-age-variants" });
  await fs.writeFile(p, JSON.stringify(data, null, 2) + "\n");
  return data.cumulative_ticks;
}

// Build a PILOT-shaped map from a derived target table, so runs beyond the pilot 10 do
// not need hand-written entries. Rows: {slug, name, anchor, target, skip}.
async function loadTargets(file) {
  const j = JSON.parse(await fs.readFile(path.resolve(ROOT, file), "utf8"));
  const map = {};
  for (const r of (j.rows || j)) {
    if (r.skip) continue;
    if (!map[r.slug]) map[r.slug] = { name: r.name, base: Number(r.anchor), targets: [], era: r.era, hair: r.hair };
    map[r.slug].targets.push(Number(r.target));
  }
  return map;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const STYLE_PROMPT = await loadStylePrompt();
  const MAP = args.targets ? await loadTargets(args.targets) : PILOT;
  // Write each run to its own directory when --out is given: candidates are evidence,
  // and overwriting them in place destroys provenance (it made a delivery dispute
  // unresolvable on 2026-07-27 — DD could not tell a re-roll from the original).
  const outDir = args.out ? path.resolve(ROOT, args.out) : path.join(ROOT, "tmp", "grok-spike", "variants");
  await fs.mkdir(outDir, { recursive: true });

  let slugs = Object.keys(MAP);
  if (args.only) slugs = slugs.filter((s) => args.only.has(s));
  const jobs = [];
  for (const slug of slugs) for (const target of selectTargets(MAP[slug].targets, args)) jobs.push({ slug, target });
  const total = jobs.length * args.candidates;

  console.log(`Age-variant forge — api=${API_BASE}  model=${MODEL}`);
  console.log(`${slugs.length} character(s) × ${jobs.length} target(s) × ${args.candidates} candidate(s) = ${total} generations${args.dryRun ? "  [DRY RUN — no API calls]" : ` ≈ $${(total * 0.6).toFixed(2)}`}\n`);

  const token = args.dryRun ? null : await loadToken();
  const results = [];
  let runTicks = 0;

  for (const slug of slugs) {
    const { name, base, targets, youngNote, oldNote } = MAP[slug];
    const canonical = path.join(ROOT, "characters", slug, "canonical.png");
    if (!(await fs.access(canonical).then(() => true).catch(() => false))) die(`missing canonical: ${canonical}`);
    const dataUri = args.dryRun ? null : `data:image/png;base64,${(await fs.readFile(canonical)).toString("base64")}`;

    for (const target of selectTargets(targets, args)) {
      const note = target < base ? youngNote : oldNote;
      const prompt = STYLE_PROMPT(variantIdentity(name, target, base, note, args.noLock, MAP[slug].era, MAP[slug].hair));
      if (args.dryRun) {
        console.log(`── ${slug}  base ${base} → age ${target}  (${target < base ? "younger" : "older"}, source=canonical.png)`);
        console.log(`   ${prompt}\n`);
        continue;
      }
      for (let k = 1; k <= args.candidates; k++) {
        process.stdout.write(`  • ${slug} age${target} c${k} … `);
        let r = await request(token, { model: MODEL, prompt, image: { type: "image_url", url: dataUri }, aspect_ratio: "1:1", resolution: "1k", response_format: "b64_json" });
        if (!r.ok && r.moderated) { runTicks += r.ticks; r = await request(token, { model: MODEL, prompt, image: { type: "image_url", url: dataUri }, aspect_ratio: "1:1", resolution: "1k", response_format: "b64_json" }); }
        runTicks += r.ticks;
        if (!r.ok) { console.log(`✗ ${r.error}`); results.push({ slug, target, k, ok: false }); continue; }
        const saved = await saveImage(r.item, path.join(outDir, `${slug}__age${target}__c${k}`));
        console.log(`✓ ${path.basename(saved.dest)}`);
        results.push({ slug, target, k, ok: true, file: path.relative(ROOT, saved.dest) });
      }
    }
  }

  if (args.dryRun) { console.log("Dry run complete — prompts above. Re-run without --dry-run to generate."); return; }

  // Per-character 3-age contact sheet: [canonical @ base] [young c1-3] [old c1-3] — the review artifact.
  const rows = [];
  for (const slug of slugs) {
    const { name, base, targets } = MAP[slug];
    const cells = [{ label: `canonical · age ${base}`, uri: await embed(path.join(ROOT, "characters", slug, "canonical.png")), anchor: true }];
    for (const target of targets) for (let k = 1; k <= args.candidates; k++) {
      const rec = results.find((r) => r.slug === slug && r.target === target && r.k === k);
      cells.push({ label: `age ${target} · c${k}`, uri: rec?.ok ? await embed(path.join(ROOT, rec.file)) : null });
    }
    rows.push({ name, cells });
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Age-variant pilot — identity across ages</title><style>
    :root{color-scheme:light dark}body{font:15px/1.5 system-ui,sans-serif;margin:0;padding:24px;background:#0e0e10;color:#eee}
    h1{font-size:19px;margin:0 0 4px}.sub{opacity:.65;margin:0 0 20px}
    section{margin:0 0 26px}h2{font-size:15px;margin:0 0 8px;opacity:.85}
    .strip{display:flex;gap:12px;flex-wrap:wrap}figure{margin:0;width:190px}
    img{width:190px;height:190px;object-fit:cover;border-radius:10px;display:block;background:#8883}
    .miss{width:190px;height:190px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:#8882;opacity:.6}
    figcaption{font-size:12px;opacity:.7;margin-top:5px;text-align:center}
    figure.anchor img{outline:2px solid #4a90d9;outline-offset:-2px}
  </style></head><body>
    <h1>Age-variant pilot — same person across three ages?</h1>
    <p class="sub">Blue = the locked canonical (identity anchor). Judge each row as ONE person aged, not three people. Any row that reads as different people fails the identity gate.</p>
    ${rows.map((r) => `<section><h2>${r.name}</h2><div class="strip">${r.cells.map((c) => `<figure class="${c.anchor ? "anchor" : ""}">${c.uri ? `<img src="${c.uri}">` : `<div class="miss">✗</div>`}<figcaption>${c.label}</figcaption></figure>`).join("")}</div></section>`).join("")}
  </body></html>`;
  const sheet = path.join(outDir, "pilot-contact-sheet.html");
  await fs.writeFile(sheet, html);

  const cumulative = await recordUsage(runTicks, results.length);
  const usdApprox = (runTicks / TICKS_PER_USD).toFixed(2);
  console.log(`\n── run: ~${usdApprox} across ${results.length} generations  |  cumulative all-tools: ~${(cumulative / TICKS_PER_USD).toFixed(2)}`);
  console.log(`✓ Contact sheet: ${path.relative(ROOT, sheet)}`);
}

main().catch((e) => die(`Unexpected: ${e.stack || e.message}`));
