import { execSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = "/Users/sterlingdigital/IFORGE";
const XLSX = path.join(ROOT, ".archive/superseded-rosters/TOP 120.xlsx");
const CSV  = path.join(ROOT, "TOP 100.csv");
// TOP 100.csv carries the full breakthrough/hook/arc text, so it is self-sufficient.
// The archived xlsx is consulted ONLY when the CSV does not yet exist.
const haveCsv = await fs.access(CSV).then(() => true).catch(() => false);
const dec = s => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");

function loadFromXlsx() {
const ssXml = execSync(`unzip -p "${XLSX}" xl/sharedStrings.xml`).toString();
const shared = [...ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)]
  .map(m => dec([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join("")));

const shXml = execSync(`unzip -p "${XLSX}" xl/worksheets/sheet1.xml`).toString();
const raw = [];
for (const rm of shXml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
  const cells = {};
  for (const cm of rm[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g)) {
    const v = (cm[3].match(/<v>([\s\S]*?)<\/v>/) || [])[1];
    if (v !== undefined) cells[cm[1]] = /t="s"/.test(cm[2]) ? shared[+v] : dec(v);
  }
  raw.push({ n: +rm[1], cells });
}
  return raw;
}

// Read the prose (breakthrough / hook / arc) back out of the CSV. It holds the full
// text, so the list regenerates from itself; the archived xlsx is only a cold start.
async function loadFromCsv() {
  const t = await fs.readFile(CSV, "utf8");
  const rows = []; let cur = [""], q = false;
  for (let i = 0; i < t.length; i++) { const ch = t[i];
    if (q) { if (ch === '"' && t[i+1] === '"') { cur[cur.length-1] += '"'; i++; }
             else if (ch === '"') q = false; else cur[cur.length-1] += ch; }
    else if (ch === '"') q = true; else if (ch === ",") cur.push("");
    else if (ch === "\n") { rows.push(cur); cur = [""]; }
    else if (ch !== "\r") cur[cur.length-1] += ch; }
  if (cur.length > 1) rows.push(cur);
  const h = rows[0], ix = n => h.indexOf(n);
  return rows.slice(1).filter(r => r.length === h.length && r[ix("character")]).map(r => ({
    rank: r[ix("rank")], name: r[ix("character")],
    born: r[ix("born")] || "", died: r[ix("died")] || "",
    breakthrough: r[ix("breakthrough")], hook: r[ix("title_and_hook")], arc: r[ix("narrative_arc")],
  }));
}

// Rows 102-121 were pasted as one tab-delimited string, then comma-split across columns.
// Rejoin in column order with ", " (the delimiter that was consumed), then split on tabs.
const COLS = ["A","B","C","D","E","F","G","H","I","J"];
function fields(r) {
  const vals = COLS.map(c => r.cells[c]).filter(v => v !== undefined && v !== "");
  if (vals.some(v => String(v).includes("\t")))
    return vals.join(", ").split("\t").map(s => s.trim());
  // One row (Morton) was pasted from a MARKDOWN TABLE: pipe-delimited, with ** bold.
  // Left unhandled it collapses breakthrough + hook + arc into a single cell.
  if (vals.length && String(vals[vals.length - 1]).includes(" | ")) {
    const head = vals.slice(0, -1);
    const tail = String(vals[vals.length - 1]).split(" | ")
      .map(x => x.replace(/\*\*/g, "").trim());
    return [...head, ...tail];
  }
  return vals;                                                    // already clean
}

// locked cast, for the IN/OUT decision
const norm = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");
const cast = {};
for (const slug of (await fs.readdir(path.join(ROOT, "characters"), { withFileTypes: true }))
  .filter(e => e.isDirectory()).map(e => e.name)) {
  const dir = path.join(ROOT, "characters", slug);
  const f = (await fs.readdir(dir)).find(x => /^canonical-[0-9a-f]{12}\.png\.canonical\.json$/.test(x));
  const j = JSON.parse(await fs.readFile(path.join(dir, f), "utf8"));
  let vars = [];
  const vdir = path.join(dir, "variants");
  try {
    vars = (await fs.readdir(vdir)).filter(x => x.endsWith(".canonical.json"));
    vars = (await Promise.all(vars.map(async x =>
      JSON.parse(await fs.readFile(path.join(vdir, x), "utf8")).depicted_age))).sort((a, b) => a - b);
  } catch { }
  cast[norm(j.character_name)] = { slug, name: j.character_name, age: j.depicted_age, vars: [...new Set(vars)] };
}

// figures cut during the build, with the reason (so a drafter never queues one)
const CUT = {
  "siddharthagautama": "Removed — definitively religious figure (owner ruling)",
  "wernerheisenberg": "Removed — led Nazi Germany's nuclear weapons programme",
  "guglielmomarconi": "Removed — active Fascist; Mussolini's Grand Council",
  "fritzhabercarlbosch": "Removed — Haber personally supervised gas warfare; never cast",
  "karymullis": "Removed — later-life HIV/AIDS and climate denialism",
  "timbernerslee": "Removed — living ('alive = not on our wall')",
  "shinyayamanaka": "Removed — living",
  "jenniferdoudnaemmanuellecharpentier": "Removed — living",
  "johnbardeenwalterbrattainwilliamshockley": "Cut — rank 97, trimmed to land on exactly 100",
  "dennisritchie": "Cut — rank 98, trimmed to land on exactly 100",
};
// duo rows that resolved to a single person
const DUO = {
  "noycekilby": "jackkilby", "fredericbantingcharlesbest": "frederickbanting",
  "frederickbantingcharlesbest": "frederickbanting",
  "jameswatsonfranciscrick": "franciscrick",
  "josephmicheljacquesetiennemontgolfier": "josephmichelmontgolfier",
};

const out = [];
const source = haveCsv
  ? (await loadFromCsv()).map(r => ({ csv: true, ...r }))
  : loadFromXlsx().slice(1).map(r => ({ csv: false, r }));
console.log(`source: ${haveCsv ? "TOP 100.csv (self-sufficient)" : "archived xlsx (cold start)"}`);

for (const src of source) {
  if (src.csv) {
    const key0 = norm(src.name);
    let hit = cast[key0] || cast[DUO[key0] || ""];
    if (!hit) { const sur = key0.slice(-9);
      const k = Object.keys(cast).find(c => c.endsWith(sur) && sur.length > 5); if (k) hit = cast[k]; }
    out.push({ rank: src.rank || "", node: src.name, bare: hit ? hit.name : src.name,
      in100: hit ? "YES" : "NO",
      status: hit ? "" : (CUT[key0] || "Not selected for the final 100"),
      slug: hit?.slug || "", age: hit?.age ?? "", vars: hit?.vars.join(" ") ?? "",
      born: src.born, died: src.died,
      breakthrough: src.breakthrough, hook: src.hook, arc: src.arc });
    continue;
  }
  const r = src.r;                                     // xlsx path
  const f = fields(r);
  if (f.length < 2) continue;
  const rank = f[0], node = f[1];
  if (!node || !/\(/.test(node)) continue;            // not a figure row
  // Dates: take the LAST parenthetical holding digits ("Ibn Sina (Avicenna) (980-1037 CE)"),
  // accept BCE or CE on either end, and tolerate a single floruit year.
  let born = "", died = "";
  const parens = [...node.matchAll(/\(([^)]*\d{3,4}[^)]*)\)/g)].map(m => m[1]);
  const last = parens.length ? parens[parens.length - 1] : "";
  const rng = last.match(/(?:~|c\.)?\s*(\d{3,4})\s*(BCE|CE)?\s*[–\-—]\s*(?:~|c\.)?(\d{3,4})\s*(BCE|CE)?/);
  if (rng) {
    const bce = /BCE/.test(rng[2] || "") || /BCE/.test(rng[4] || "") || +rng[1] > +rng[3];
    born = bce ? `${rng[1]} BCE` : rng[1];
    died = bce ? `${rng[3]} BCE` : rng[3];
  } else {
    const one = last.match(/(?:~|c\.)?\s*(\d{3,4})\s*(BCE|CE)?/);
    if (one) born = `c. ${one[1]}${/BCE/.test(one[2] || "") ? " BCE" : ""}`;
  }
  // Rows whose dates belong to a duo: "(1891/1899)" gives both people's birth years,
  // and which one we cast varies. Explicit, because guessing the order would be wrong.
  const DATES = {
    "frederick banting": ["1891", "1941"],
    "francis crick":     ["1916", "2004"],
    "joseph-michel montgolfier": ["1740", "1810"],
    "jack kilby":        ["1923", "2005"],  // source row carried INVENTION years (1958/1959)
    // Verified against Wikidata 2026-07-29: 97/100 matched exactly. These three are
    // genuinely uncertain in the historical record and sources differ, so they are
    // marked approximate rather than silently asserted.
    "al-khwarizmi":      ["c. 780", "c. 850"],   // Wikidata: c.750-846
    "hypatia":           ["c. 350", "415"],      // birth disputed c.350-370; death certain

  };
  let bare = node.replace(/\s*\(.*$/, "").trim();
  // "Newcomen, Thomas" -> "Thomas Newcomen"; strip middle initials like "T.G."
  if (/^[^,]+,\s*\S+$/.test(bare)) bare = bare.split(/,\s*/).reverse().join(" ");
  bare = bare.replace(/\b[A-Z]\.([A-Z]\.)*\s*/g, "").replace(/\s+/g, " ").trim();
  let key = norm(bare);
  if (DUO[key]) key = DUO[key];
  let hit = cast[key];
  if (!hit) {                                          // surname fallback
    const sur = key.slice(-9);
    const k = Object.keys(cast).find(c => c.endsWith(sur) && sur.length > 5);
    if (k) hit = cast[k];
  }
  const fixed = hit && DATES[hit.name.toLowerCase()];
  if (fixed) { born = fixed[0]; died = fixed[1]; }
  out.push({
    rank: /^\d+$/.test(rank) ? rank : "",
    // The cast member's own name always wins. Source rows still carry duo labels
    // ("Noyce & Kilby") even where the cast resolved to one person.
    node, bare: hit ? hit.name : bare,
    in100: hit ? "YES" : "NO",
    status: hit ? "" : (CUT[key] || "Not selected for the final 100"),
    slug: hit?.slug || "", age: hit?.age ?? "", vars: hit?.vars.join(" ") ?? "",
    born, died,
    breakthrough: f[2] || "", hook: f[3] || "", arc: f[4] || "",
  });
}

// characters in the cast that no spreadsheet row matched (late owner additions)
const matched = new Set(out.filter(o => o.slug).map(o => o.slug));
for (const c of Object.values(cast)) {
  if (matched.has(c.slug)) continue;
  out.push({ rank: "", node: c.name, bare: c.name, in100: "YES",
    status: "Added after the spreadsheet — no source row", slug: c.slug,
    age: c.age, vars: c.vars.join(" "), born: "", died: "", breakthrough: "", hook: "", arc: "" });
}

const q = s => `"${String(s ?? "").replace(/"/g, '""')}"`;
const HEAD = ["in_100","rank","character","slug","born","died","canonical_age","variant_ages","status_or_reason","breakthrough","title_and_hook","narrative_arc"];
const csv = [HEAD.join(",")].concat(
  out.sort((a, b) => (b.in100 === "YES") - (a.in100 === "YES") || a.bare.localeCompare(b.bare))
     .map(o => [o.in100, o.rank, o.bare, o.slug, o.born, o.died, o.age, o.vars, o.status, o.breakthrough, o.hook, o.arc].map(q).join(","))
).join("\n");

await fs.writeFile(path.join(ROOT, "TOP 100.csv"), csv + "\n");
await fs.writeFile(path.join(ROOT, "tmp/grok-spike/final-cast.json"), JSON.stringify(out, null, 1) + "\n");

const yes = out.filter(o => o.in100 === "YES");
console.log("rows written:", out.length, "| IN_100:", yes.length, "| excluded:", out.length - yes.length);
console.log("in-cast rows still missing script text:", yes.filter(o => !o.breakthrough).map(o => o.bare).join(", ") || "none");
