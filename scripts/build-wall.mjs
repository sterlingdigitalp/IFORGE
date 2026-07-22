#!/usr/bin/env node
// Composite-wall builder — the "fraternity composite" view for judging cast harmony.
// Renders a set of labeled images as one self-contained HTML page (data-URI embedded).
// Reusable across the convergence loop; here it assembles the seed-4 anchor proposal.
//
// Usage: node scripts/build-wall.mjs --title "Seed-4" --out path.html slug=imgpath [slug=imgpath ...]
//        slug=refpath::genpath renders a source→result pair in one card (ref left, outlined).

import { promises as fs } from "node:fs";
import path from "node:path";

const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

function parse(argv) {
  const o = { title: "Composite wall", out: "wall.html", items: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--title") o.title = argv[++i];
    else if (argv[i] === "--out") o.out = argv[++i];
    else if (argv[i].includes("=")) { const j = argv[i].indexOf("="); o.items.push({ label: argv[i].slice(0, j), file: argv[i].slice(j + 1) }); }
  }
  return o;
}

async function embed(file) {
  const buf = await fs.readFile(file);
  const ext = path.extname(file).slice(1).toLowerCase();
  return `data:${MIME[ext] || "image/jpeg"};base64,${buf.toString("base64")}`;
}

const o = parse(process.argv.slice(2));
const cells = [];
for (const it of o.items) {
  const [refFile, genFile] = it.file.includes("::") ? it.file.split("::") : [null, it.file];
  cells.push({ ...it, uri: await embed(genFile), refUri: refFile ? await embed(refFile) : null });
}

const html = `<!doctype html><html><head><meta charset="utf-8"><title>${o.title}</title><style>
  :root{color-scheme:light dark}
  body{font:15px/1.5 system-ui,sans-serif;margin:0;padding:28px;background:#f4f4f5;color:#111}
  @media(prefers-color-scheme:dark){body{background:#101012;color:#eee}}
  h1{font-size:18px;margin:0 0 2px}.sub{opacity:.6;margin:0 0 22px;font-size:13px}
  .wall{display:flex;gap:18px;flex-wrap:wrap;justify-content:center}
  figure{margin:0;width:250px}
  figure.pair{width:432px}
  .imgs{display:flex;gap:8px;align-items:flex-start}
  img{width:250px;height:250px;object-fit:cover;border-radius:12px;display:block;background:#8883;box-shadow:0 1px 6px #0003}
  .pair img{width:212px;height:212px}
  .pair img.ref{outline:2px solid #4a90d9;outline-offset:-2px}
  figcaption{font-size:13px;opacity:.75;margin-top:7px;text-align:center;text-transform:capitalize}
</style></head><body>
  <h1>${o.title}</h1>
  <p class="sub">Judge as a SET — do they read as one cast? Watch background tone, lighting, and framing, not just each face.${cells.some((c) => c.refUri) ? " Blue outline = source reference." : ""}</p>
  <div class="wall">${cells.map((c) => c.refUri
    ? `<figure class="pair"><div class="imgs"><img class="ref" src="${c.refUri}" alt="${c.label} source"><img src="${c.uri}" alt="${c.label}"></div><figcaption>${c.label}</figcaption></figure>`
    : `<figure><img src="${c.uri}" alt="${c.label}"><figcaption>${c.label}</figcaption></figure>`).join("")}</div>
</body></html>`;

await fs.mkdir(path.dirname(path.resolve(o.out)), { recursive: true });
await fs.writeFile(o.out, html);
console.log(`wrote ${o.out} (${cells.length} tiles)`);
