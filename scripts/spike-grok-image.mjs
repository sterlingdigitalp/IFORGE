#!/usr/bin/env node
// SPIKE — throwaway feasibility probe for the Grok/xAI image pivot. NOT wired into the
// iforge pipeline. Iteration 3 goal: reliably hit BALANCED stylization (clearly animated,
// but real proportions/age, faithful wardrobe, nothing invented) on the /images/edits path,
// and generate a few candidates per figure so we can pick — mirroring iforge's promote loop.
//
// Auth: OAuth bearer from ~/.grok/auth.json (the Grok CLI's cached login). Subscription/
// OAuth only — never an API key. Run this yourself; the token stays local. On 401, re-run
// `grok` once to refresh login.
//
// Usage:
//   node scripts/spike-grok-image.mjs --probe
//   node scripts/spike-grok-image.mjs [--candidates 3] [--recipes edit-pixar]
//
// Flags: --candidates N  --recipes <id,id>  --refs <dir>  --out <dir>  --model <id>  --prompt "<text>"
//
// Usage metering: every call returns cost_in_usd_ticks; this sums it per run and keeps a
// cumulative tally in tmp/grok-spike/usage.json so you can correlate with the Grok meter.

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API_BASE = (process.env.XAI_API_BASE || "https://api.x.ai/v1").replace(/\/+$/, "");
const AUTH_PATH = process.env.GROK_AUTH_PATH || path.join(os.homedir(), ".grok", "auth.json");
const DEFAULT_MODEL = process.env.XAI_IMAGE_MODEL || "grok-imagine-image-quality";
const TIMEOUT_MS = 120_000;
const TICKS_PER_USD = 1e9; // cost_in_usd_ticks appears to be nano-dollars; USD figure is approximate.

// BALANCED target: clearly animated, but grounded — real proportions and real apparent age,
// no beautifying, no invented props. The explicit "do NOT" lines exist because the stronger
// prompt in iteration 2 drifted younger/prettier and invented accessories (atom pin, prism).
const STYLE_PROMPT = (identity) =>
  `A stylized 3D animated cartoon character portrait in the style of a modern animated feature film. It must UNMISTAKABLY read as animation — a rendered CGI cartoon, NOT a photograph and NOT a colorized photo. ` +
  `Character: ${identity}. ` +
  `Render with clean smooth stylized skin (no realistic pores or photographic texture), gently simplified and rounded forms, warm expressive but natural-sized eyes, and a calm friendly approachable expression. ` +
  `Keep natural human proportions. Portray the character at the life stage stated in the character description; if none is stated, keep the person's real apparent age from the reference. Never beautify, slim, or genericize the face — the rendering must clearly read as stylized animation, never realism. ` +
  `Preserve their unmistakable likeness and every defining identity cue exactly: real face shape, real hairstyle and hair color, facial hair, and period-accurate wardrobe. ` +
  `Do NOT add or invent any accessories, jewelry, badges, insignia, logos, pins, or decorative motifs that are not present in the reference; no modern or anachronistic elements. ` +
  `Soft cinematic studio lighting, plain neutral background, head-and-shoulders, near-frontal with eyes to camera, full color, no text or watermark, square 1:1 composition.`;

const IDENTITY = {
  einstein: "Albert Einstein, dark tousled hair swept back from a high forehead, full dark mustache, warm thoughtful eyes, dark three-piece suit",
  newton: "Isaac Newton, long flowing wavy shoulder-length greying hair, clean-shaven, sharp contemplative gaze, dark 17th-century robe",
  tesla: "Nikola Tesla, dark hair with a center part, thin mustache, tall forehead, intense eyes, dark formal coat",
  curie: "Marie Curie, dark hair pulled up and back, calm resolute expression, high cheekbones, high-collared dark Victorian dress",
  // Batch 2 — hard-source stress figures. Cues must carry what the reference cannot:
  // color/material translation (bust, chalk, engraving) and pose normalization (profile refs).
  aristotle: "Aristotle, the ancient Greek philosopher in his early fifties, rendered as a living person translated from the marble bust: warm Mediterranean skin, short wavy grey-streaked hair receding at the temples, a full curly grey beard — the hair and beard must be soft natural human hair with individual flowing strands and warm grey-brown color variation, NOT sculpted stone or uniform carved ridges — deep-set thoughtful eyes, wearing a draped earth-toned himation robe over one shoulder",
  hypatia: "Hypatia of Alexandria, a wise Greek scholar woman in her forties with a defined mature facial structure, gentle lines around the eyes, and detailed naturally-textured skin and hair matching the rendering detail of a mature adult character, auburn hair with individual visible strands braided and pinned up in a classical Greek style with a simple thin headband, intelligent calm gaze, wearing a simple draped white chiton and palla, shown near-frontal facing the viewer",
  ibn_al_haytham: "Ibn al-Haytham the medieval Arab scholar of optics in his mid-forties, wearing a neatly wrapped white turban, full grey-streaked dark beard, warm brown skin, dignified scholarly expression, plain dark scholar's robe, shown near-frontal facing the viewer",
  leonardo: "Leonardo da Vinci in his vigorous mid-forties, the same unmistakable face as the reference but younger: long flowing auburn-brown hair and a full beard with only early streaks of grey, prominent brow and aquiline nose, penetrating wise eyes, wearing a simple muted Renaissance tunic, rendered in full natural color",
  lovelace: "Ada Lovelace, a young Victorian woman with dark brown hair center-parted and styled in soft side ringlet curls framing her face, delicate features, gentle intelligent expression, wearing a simple matte violet Victorian gown with a modest neckline — OMIT the black lace veil, the flower headdress, and all hair ornaments from the reference; plain simple hairstyle only, matte natural fabrics, no satin gloss",
  // A/B ref test: same target look as `lovelace` but seeded from the authentic 1843
  // Claudet daguerreotype (soft, damaged, three-quarter) instead of the Chalon watercolor.
  lovelace_dag: "Ada Lovelace, a young Victorian woman with dark brown hair center-parted and styled in soft side ringlet curls framing her face, delicate features, gentle intelligent expression, near-frontal with eyes to camera, wearing a simple matte violet Victorian gown with a modest neckline — plain simple hairstyle with no veil, no flowers, and no hair ornaments; matte natural fabrics, no satin gloss; render in full natural color",
  // Batch 3 — figures 11-20 of the cast, all at impact age (~35-55).
  galileo: "Galileo Galilei in his mid-forties at the height of his telescope discoveries, the same face as the reference but de-aged: dark auburn-brown hair and a full trimmed beard with minimal grey, alert penetrating eyes, wearing a dark 17th-century doublet with a plain white collar",
  douglass: "Frederick Douglass in his mid-thirties, deep brown skin, thick black hair in his distinctive voluminous side-parted style, clean upper lip with a short chin beard, intense resolute dignified gaze, wearing a dark formal coat, patterned vest and loosely tied cravat, rendered in full natural color",
  nightingale: "Florence Nightingale in her mid-thirties during the Crimean campaign, smooth dark brown hair parted in the center, gentle but determined expression, fair skin, wearing a plain dark Victorian dress with a simple white lace collar, rendered in full natural color",
  turing: "Alan Turing in his mid-thirties, short dark brown hair neatly side-parted, clean-shaven, bright thoughtful slightly shy expression, wearing a grey tweed jacket, white shirt and dark knitted tie, rendered in full natural color",
  faraday: "Michael Faraday in his mid-forties at the height of his electromagnetic discoveries, the same face as the reference but de-aged: dark brown hair parted in the middle and combed to the sides, clean-shaven, warm curious eyes, wearing a dark Victorian frock coat with a high white collar and dark cravat, rendered in full natural color",
  archimedes: "Archimedes of Syracuse in his mid-fifties, translated from the painting: a full head of tousled grey-streaked dark curly hair as shown in the reference, a full grey-streaked beard, weathered Mediterranean skin, deep-set focused eyes of a geometer, wearing a simple draped earth-toned Greek robe",
  confucius: "Confucius in his mid-fifties, translated from the ink portrait into a living person: long grey-streaked black beard and mustache, hair gathered under a traditional dark scholar's cap, kind wise deeply lined face, warm East Asian skin tone, wearing layered dark Hanfu robes with wide sleeves, shown near-frontal facing the viewer, rendered in full natural color",
  gautama: "Siddhartha Gautama the Buddha in his forties after his awakening, depicted respectfully as a living human teacher translated from the statue: serene deeply peaceful expression with a gentle half-smile, warm brown South Asian skin, tightly curled black hair, elongated earlobes, wearing a simple saffron-orange monastic robe draped over one shoulder, plain neutral background, no halo and no ornaments",
  gutenberg: "Johannes Gutenberg in his late forties as a master craftsman at the height of his printing work, translated from the painting: a dark fur cap, full dark brown beard, alert determined eyes, wearing a dark medieval doublet with a small white ruffled collar, rendered in warm natural color",
  euclid: "Euclid of Alexandria in his late forties, translated from the painting into a warm living person: receding dark hair, a full dark beard, intelligent deep-set eyes with the focused gaze of a geometer, olive Mediterranean skin, wearing a simple draped grey-brown scholar's robe, soft even lighting, plain neutral background",
  al_khwarizmi: "Al-Khwarizmi the Persian mathematician in his mid-forties, translated from the engraving into a living person in full color: a neatly wrapped white turban, dark pointed beard, sharp intelligent deep-set eyes, olive skin, wearing a dark scholarly Abbasid-era robe",
  borlaug: "Norman Borlaug in his early fifties at the height of the wheat program, the same face as the reference but de-aged to a strong weathered outdoorsman in his prime: sandy brown-grey hair neatly side-parted, tanned sun-creased friendly face, confident warm smile, wearing a practical khaki field shirt open at the collar"
};

const RECIPES = {
  "edit-pixar": {
    endpoint: "/images/edits",
    body: (identity, dataUri, model, prompt) => ({
      model, prompt, image: { type: "image_url", url: dataUri },
      aspect_ratio: "1:1", resolution: "1k", response_format: "b64_json"
    })
  },
  "gen-ref-pixar": {
    endpoint: "/images/generations",
    body: (identity, dataUri, model, prompt) => ({
      model, prompt, image: { type: "image_url", url: dataUri },
      aspect_ratio: "1:1", resolution: "1k", n: 1, response_format: "b64_json"
    })
  }
};

function parseArgs(argv) {
  const a = { probe: false, refs: null, out: null, model: DEFAULT_MODEL, prompt: null, recipes: ["edit-pixar"], candidates: 3, only: null };
  const v = (i) => argv[i + 1];
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--probe": a.probe = true; break;
      case "--refs": a.refs = v(i++); break;
      case "--out": a.out = v(i++); break;
      case "--model": a.model = v(i++); break;
      case "--prompt": a.prompt = v(i++); break;
      case "--candidates": a.candidates = Math.max(1, Number(v(i++)) || 3); break;
      case "--recipes": a.recipes = v(i++).split(",").map((s) => s.trim()).filter(Boolean); break;
      case "--only": a.only = new Set(v(i++).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)); break;
    }
  }
  a.refs = a.refs || path.join(ROOT, "tmp", "grok-spike", "refs");
  a.out = a.out || path.join(ROOT, "tmp", "grok-spike", "out");
  return a;
}

function die(msg) { console.error(`\n✗ ${msg}\n`); process.exit(1); }

async function loadToken() {
  let raw;
  try { raw = await fs.readFile(AUTH_PATH, "utf8"); }
  catch { die(`Could not read ${AUTH_PATH}. Is the Grok CLI logged in? Run: grok`); }
  let json;
  try { json = JSON.parse(raw); } catch { die(`${AUTH_PATH} is not valid JSON.`); }
  const looksJwt = (s) => typeof s === "string" && s.split(".").length === 3 && s.length > 40;
  const strings = [];
  const walk = (obj, keys = []) => {
    if (!obj || typeof obj !== "object") return;
    for (const [k, val] of Object.entries(obj)) {
      const kp = [...keys, k];
      if (typeof val === "string") strings.push({ field: kp.join("."), value: val, jwt: looksJwt(val) });
      else if (val && typeof val === "object") walk(val, kp);
    }
  };
  walk(json);
  const candidates = strings.filter((s) =>
    s.value.length > 40 && !/refresh|id_token/i.test(s.field) &&
    (s.jwt || /access|token|bearer|jwt|credential|session|key/i.test(s.field)));
  candidates.sort((a, b) =>
    (/(^|\.)access_?token$/i.test(b.field) - /(^|\.)access_?token$/i.test(a.field)) ||
    (b.jwt - a.jwt) || (b.value.length - a.value.length));
  if (!candidates.length) die(`No access-token-like field found in ${AUTH_PATH}.`);
  const forced = process.env.GROK_TOKEN_FIELD && strings.find((c) => c.field === process.env.GROK_TOKEN_FIELD);
  const chosen = forced || candidates[0];
  console.log(`  auth: using field "${chosen.field}" (${chosen.jwt ? "JWT-shaped" : "opaque"})`);
  return chosen.value;
}

function ticksOf(raw, text) {
  const t = raw?.usage?.cost_in_usd_ticks;
  if (Number.isFinite(t)) return Number(t);
  const m = typeof text === "string" && text.match(/cost_in_usd_ticks"?\s*:\s*(\d+)/);
  return m ? Number(m[1]) : 0;
}

async function request(endpoint, token, body) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res, text;
  try {
    res = await fetch(`${API_BASE}${endpoint}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: controller.signal
    });
    text = await res.text();
  } catch (e) {
    clearTimeout(t);
    return { ok: false, error: controller.signal.aborted ? `timed out after ${TIMEOUT_MS}ms` : e.message, ticks: 0 };
  }
  clearTimeout(t);
  if (res.status === 401) die(`401 Unauthorized — Grok token expired/invalid. Re-run \`grok\` to refresh login, then retry.`);
  const ticks = ticksOf(null, text); // moderation rejects still bill ticks
  if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}: ${text.slice(0, 160)}`, moderated: /content-moderated/i.test(text), ticks };
  let parsed; try { parsed = JSON.parse(text); } catch { return { ok: false, error: "unparseable response", ticks }; }
  const items = parsed.data || parsed.images || [];
  if (!items.length) return { ok: false, error: `no image: ${JSON.stringify(parsed).slice(0, 140)}`, ticks };
  return { ok: true, items, ticks: ticksOf(parsed, text) };
}

function sniffExt(buf) {
  if (buf.slice(0, 8).toString("hex") === "89504e470d0a1a0a") return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "jpg";
  if (buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP") return "webp";
  return "bin";
}

async function saveImage(item, destBase) {
  let buf, via;
  if (item?.b64_json) { buf = Buffer.from(item.b64_json, "base64"); via = "b64_json"; }
  else if (item?.url) {
    const r = await fetch(item.url);
    if (!r.ok) die(`Could not download image from ${item.url} (HTTP ${r.status})`);
    buf = Buffer.from(await r.arrayBuffer()); via = "url";
  } else die(`Response item had neither b64_json nor url`);
  const format = sniffExt(buf);
  const destPath = `${destBase}.${format === "bin" ? "img" : format}`;
  await fs.writeFile(destPath, buf);
  return { via, format, destPath };
}

const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };
const fmtTicks = (t) => `${t.toLocaleString()} ticks (~$${(t / TICKS_PER_USD).toFixed(3)})`;

async function recordUsage(outDir, runTicks, calls) {
  const p = path.join(path.dirname(outDir), "usage.json");
  let data = { cumulative_ticks: 0, runs: [] };
  try { data = JSON.parse(await fs.readFile(p, "utf8")); } catch { /* first run */ }
  data.cumulative_ticks = (data.cumulative_ticks || 0) + runTicks;
  data.runs.push({ at: new Date().toISOString(), ticks: runTicks, calls });
  await fs.writeFile(p, JSON.stringify(data, null, 2) + "\n");
  return data.cumulative_ticks;
}

async function probe(token, args) {
  console.log(`\n▶ PROBE  text→image  ${API_BASE}/images/generations  model=${args.model}`);
  await fs.mkdir(args.out, { recursive: true });
  const r = await request("/images/generations", token, { model: args.model, prompt: args.prompt || "a simple friendly cartoon owl, plain background", n: 1, aspect_ratio: "1:1", resolution: "1k", response_format: "b64_json" });
  if (!r.ok) die(`Probe failed: ${r.error}`);
  const saved = await saveImage(r.items[0], path.join(args.out, "probe"));
  console.log(`✓ PROBE OK — ${saved.destPath} (${saved.format}) · ${fmtTicks(r.ticks)}\n`);
}

async function runMatrix(token, args) {
  let entries;
  try { entries = await fs.readdir(args.refs); }
  catch { die(`Reference folder not found: ${args.refs}`); }
  let refs = entries.filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort();
  if (args.only) refs = refs.filter((f) => args.only.has(path.basename(f, path.extname(f)).toLowerCase()));
  if (!refs.length) die(`No reference images in ${args.refs}${args.only ? ` matching --only ${[...args.only].join(",")}` : ""}.`);
  const recipeIds = args.recipes.map((id) => RECIPES[id] ? id : die(`Unknown recipe "${id}". Known: ${Object.keys(RECIPES).join(", ")}`));

  await fs.mkdir(args.out, { recursive: true });
  const totalCalls = refs.length * recipeIds.length * args.candidates;
  console.log(`\n▶ BALANCED BATCH  ${refs.length} figure(s) × ${recipeIds.length} recipe(s) × ${args.candidates} candidate(s) = ${totalCalls} calls  model=${args.model}\n`);

  const results = [];
  let runTicks = 0, calls = 0;
  for (const file of refs) {
    const name = path.basename(file, path.extname(file)).toLowerCase();
    const ext = path.extname(file).slice(1).toLowerCase();
    const bytes = await fs.readFile(path.join(args.refs, file));
    const dataUri = `data:${MIME[ext] || "image/jpeg"};base64,${bytes.toString("base64")}`;
    const identity = IDENTITY[name] || name.replace(/[_-]+/g, " ");
    const prompt = args.prompt || STYLE_PROMPT(identity);

    for (const id of recipeIds) {
      const recipe = RECIPES[id];
      for (let c = 1; c <= args.candidates; c++) {
        process.stdout.write(`  • ${name} / ${id} / c${c} … `);
        const reqBody = recipe.body(identity, dataUri, args.model, prompt);
        const started = Date.now();
        let r = await request(recipe.endpoint, token, reqBody);
        let retried = false;
        if (!r.ok && r.moderated) { retried = true; runTicks += r.ticks; calls++; r = await request(recipe.endpoint, token, reqBody); }
        const secs = ((Date.now() - started) / 1000).toFixed(1);
        runTicks += r.ticks; calls++;
        if (!r.ok) { console.log(`✗ ${r.moderated ? "moderated" + (retried ? " (x2)" : "") : r.error}`); results.push({ name, recipe: id, candidate: c, ok: false, error: r.error, moderated: !!r.moderated }); continue; }
        const saved = await saveImage(r.items[0], path.join(args.out, `${name}__${id}__c${c}`));
        console.log(`✓ ${path.basename(saved.destPath)} (${secs}s, ${r.ticks.toLocaleString()} ticks)`);
        results.push({ name, recipe: id, candidate: c, ok: true, output: path.relative(ROOT, saved.destPath), format: saved.format, ticks: r.ticks });
      }
    }
  }

  const cumulative = await recordUsage(args.out, runTicks, calls);
  await fs.writeFile(path.join(args.out, "report.json"),
    JSON.stringify({ api_base: API_BASE, model: args.model, recipes: recipeIds, candidates: args.candidates, run_ticks: runTicks, results }, null, 2) + "\n");

  const sheet = await buildContactSheet(args, refs, recipeIds, results);
  console.log(`\n── usage ──`);
  console.log(`  this run:   ${fmtTicks(runTicks)} across ${calls} call(s)`);
  console.log(`  cumulative: ${fmtTicks(cumulative)}  (all spike runs, see tmp/grok-spike/usage.json)`);
  console.log(`\n✓ Done. Outputs + report.json in ${path.relative(ROOT, args.out)}`);
  console.log(`  Contact sheet: ${path.relative(ROOT, sheet)}\n`);
}

async function buildContactSheet(args, refs, recipeIds, results) {
  const embed = async (p) => {
    try {
      const buf = await fs.readFile(p);
      const ext = sniffExt(buf) === "bin" ? path.extname(p).slice(1).toLowerCase() : sniffExt(buf);
      return `data:${MIME[ext] || "image/jpeg"};base64,${buf.toString("base64")}`;
    } catch { return null; }
  };

  const rows = [];
  for (const file of refs) {
    const name = path.basename(file, path.extname(file)).toLowerCase();
    const cells = [{ label: "reference", uri: await embed(path.join(args.refs, file)) }];
    for (const id of recipeIds) {
      for (const rec of results.filter((r) => r.name === name && r.recipe === id).sort((a, b) => a.candidate - b.candidate)) {
        cells.push({ label: `${id} c${rec.candidate}`, uri: rec.ok ? await embed(path.join(ROOT, rec.output)) : null, error: rec.error });
      }
    }
    rows.push({ name, cells });
  }

  const cell = (c) => `<figure>${c.uri ? `<img src="${c.uri}" alt="${c.label}">` : `<div class="miss">${c.error ? "failed" : "—"}</div>`}<figcaption>${c.label}${c.error ? ` <span class="err" title="${String(c.error).replace(/"/g, "&quot;")}">⚠</span>` : ""}</figcaption></figure>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Grok balanced spike — contact sheet</title><style>
    :root{color-scheme:light dark}
    body{font:15px/1.5 system-ui,sans-serif;margin:0;padding:24px;background:#fafafa;color:#111}
    @media(prefers-color-scheme:dark){body{background:#0e0e10;color:#eee}}
    h1{font-size:19px;margin:0 0 4px}.sub{opacity:.65;margin:0 0 20px}
    section{margin:0 0 26px}h2{font-size:15px;text-transform:capitalize;margin:0 0 8px;opacity:.8}
    .strip{display:flex;gap:14px;flex-wrap:wrap}
    figure{margin:0;width:200px}img{width:200px;height:200px;object-fit:cover;border-radius:10px;display:block;background:#8883}
    .miss{width:200px;height:200px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:#8882;opacity:.6}
    figcaption{font-size:12px;opacity:.7;margin-top:5px;text-align:center}.err{color:#e0a000;cursor:help}
    figure:first-child img{outline:2px solid #4a90d9}
  </style></head><body>
    <h1>Grok balanced spike — pick the best candidate per figure</h1>
    <p class="sub">model ${args.model} · balanced stylization · reference (blue outline) → candidates · ${args.candidates}/figure</p>
    ${rows.map((r) => `<section><h2>${r.name}</h2><div class="strip">${r.cells.map(cell).join("")}</div></section>`).join("")}
  </body></html>`;
  const out = path.join(args.out, "contact-sheet.html");
  await fs.writeFile(out, html);
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`Grok image spike — api=${API_BASE}`);
  const token = await loadToken();
  if (args.probe) await probe(token, args);
  else await runMatrix(token, args);
}

main().catch((e) => die(`Unexpected error: ${e.stack || e.message}`));
