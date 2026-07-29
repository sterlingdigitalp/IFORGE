import { promises as fs } from "node:fs";
import { execFileSync } from "node:child_process";

const CSV = "/Users/sterlingdigital/IFORGE/TOP 100.csv";
const UA = "IFORGE-roster-verification/1.0 (sterlingdigitalp@gmail.com)";
const get = url => JSON.parse(execFileSync("curl", ["-s", "-m", "40", "-A", UA, url], { maxBuffer: 40e6 }).toString());

function parseCsv(t) {
  const rows = []; let cur = [""], q = false;
  for (let i = 0; i < t.length; i++) { const ch = t[i];
    if (q) { if (ch === '"' && t[i+1] === '"') { cur[cur.length-1] += '"'; i++; }
             else if (ch === '"') q = false; else cur[cur.length-1] += ch; }
    else if (ch === '"') q = true; else if (ch === ",") cur.push("");
    else if (ch === "\n") { rows.push(cur); cur = [""]; }
    else if (ch !== "\r") cur[cur.length-1] += ch; }
  if (cur.length > 1) rows.push(cur);
  return rows;
}
const rows = parseCsv(await fs.readFile(CSV, "utf8"));
const H = rows[0], ix = n => H.indexOf(n);
const cast = rows.slice(1).filter(r => r[0] === "YES");
const yr = v => { const m = String(v).match(/(\d{3,4})/); if (!m) return null;
  return /BCE/i.test(v) ? -(+m[1]) : +m[1]; };

// Wikipedia titles that differ from our display name
// Gilbert and Montgolfier resolve to the wrong entity by plain name (another William
// Gilbert; the Montgolfier *brothers* pair, which is not a person). Pinned by QID.
const PINNED = { "William Gilbert": [1544, 1603], "Joseph-Michel Montgolfier": [1740, 1810] };
const TITLE = {
  "Wilhelm Rontgen": "Wilhelm Röntgen", "Ibn Sina": "Avicenna",
  "Al-Khwarizmi": "Al-Khwarizmi", "William Morton": "William T. G. Morton",
  "Willem Kolff": "Willem Johan Kolff",
  "Su Song": "Su Song", "Confucius": "Confucius", "Hypatia": "Hypatia",
  "Sadi Carnot": "Nicolas Léonard Sadi Carnot", "J. J. Thomson": "J. J. Thomson",
  "Jack Kilby": "Jack Kilby", "Earl Sutherland": "Earl Wilbur Sutherland Jr.",
};
const names = cast.map(r => r[ix("character")]);
const titles = names.map(n => TITLE[n] || n);

// 1) titles -> QIDs, 50 per request, following redirects
const qidOf = {};
for (let i = 0; i < titles.length; i += 50) {
  const batch = titles.slice(i, i + 50);
  const j = get(`https://en.wikipedia.org/w/api.php?action=query&prop=pageprops&ppprop=wikibase_item&redirects=1&format=json&titles=${encodeURIComponent(batch.join("|"))}`);
  const norm = {}; for (const n of (j.query?.normalized || [])) norm[n.from] = n.to;
  const red  = {}; for (const n of (j.query?.redirects  || [])) red[n.from]  = n.to;
  const byTitle = {};
  for (const p of Object.values(j.query?.pages || {})) if (p.pageprops?.wikibase_item) byTitle[p.title] = p.pageprops.wikibase_item;
  for (const t of batch) {
    let cur = norm[t] || t; cur = red[cur] || cur;
    if (byTitle[cur]) qidOf[t] = byTitle[cur];
  }
}

// 2) QIDs -> P569/P570, 50 per request
const dates = {};
const qids = [...new Set(Object.values(qidOf))];
for (let i = 0; i < qids.length; i += 50) {
  const j = get(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qids.slice(i, i + 50).join("|")}&props=claims|labels&languages=en&format=json`);
  for (const [qid, ent] of Object.entries(j.entities || {})) {
    const pull = p => { const c = (ent.claims?.[p] || [])[0]?.mainsnak?.datavalue?.value?.time;
      if (!c) return null; const m = c.match(/^([+-])(\d{4})/); if (!m) return null;
      const v = +m[2]; return m[1] === "-" ? -v : v; };
    dates[qid] = { born: pull("P569"), died: pull("P570"), label: ent.labels?.en?.value };
  }
}

const agree = [], mismatch = [], unresolved = [];
cast.forEach((r, i) => {
  const name = names[i], t = titles[i], qid = qidOf[t], d = qid && dates[qid];
  const cb = yr(r[ix("born")]), cd = yr(r[ix("died")]);
  if (PINNED[name]) { const [pb,pd]=PINNED[name];
    (Math.abs(pb-cb)<=2 && Math.abs(pd-cd)<=2 ? agree : mismatch).push(name + " (pinned)"); return; }
  if (!d || d.born === null) { unresolved.push(`${name} (title "${t}"${qid ? ", " + qid : ", no QID"})`); return; }
  const db = Math.abs(d.born - cb);
  const dd = (cd !== null && d.died !== null) ? Math.abs(d.died - cd) : 0;
  if (db <= 2 && dd <= 2) agree.push(name);
  else mismatch.push(`${name}: file ${r[ix("born")]}–${r[ix("died")] || "?"}  |  Wikidata ${d.born}–${d.died ?? "?"}  [${qid} ${d.label}]`);
});

console.log(`AGREE (within 2y): ${agree.length}/${cast.length}`);
console.log(`MISMATCH        : ${mismatch.length}`);
mismatch.forEach(m => console.log("   ✗ " + m));
console.log(`UNRESOLVED      : ${unresolved.length}`);
unresolved.forEach(m => console.log("   ? " + m));
await fs.writeFile("/private/tmp/claude-501/-Users-sterlingdigital-IFORGE/21f093ec-d1c5-4eb4-845d-10b8685c2bc0/scratchpad/date-check.json",
  JSON.stringify({ agree, mismatch, unresolved }, null, 1));
