import { execSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = "/Users/sterlingdigital/IFORGE";
const XLSX = path.join(ROOT, ".archive/superseded-rosters/TOP 120.xlsx");  // source only; never the answer
const dec = s => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");

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
for (const r of raw.slice(1)) {                       // skip header
  const f = fields(r);
  if (f.length < 2) continue;
  const rank = f[0], node = f[1];
  if (!node || !/\(/.test(node)) continue;            // not a figure row
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
  out.push({
    rank: /^\d+$/.test(rank) ? rank : "",
    // The cast member's own name always wins. Source rows still carry duo labels
    // ("Noyce & Kilby") even where the cast resolved to one person.
    node, bare: hit ? hit.name : bare,
    in100: hit ? "YES" : "NO",
    status: hit ? "" : (CUT[key] || "Not selected for the final 100"),
    slug: hit?.slug || "", age: hit?.age ?? "", vars: hit?.vars.join(" ") ?? "",
    breakthrough: f[2] || "", hook: f[3] || "", arc: f[4] || "",
  });
}

// characters in the cast that no spreadsheet row matched (late owner additions)
const matched = new Set(out.filter(o => o.slug).map(o => o.slug));
for (const c of Object.values(cast)) {
  if (matched.has(c.slug)) continue;
  out.push({ rank: "", node: c.name, bare: c.name, in100: "YES",
    status: "Added after the spreadsheet — no source row", slug: c.slug,
    age: c.age, vars: c.vars.join(" "), breakthrough: "", hook: "", arc: "" });
}

const q = s => `"${String(s ?? "").replace(/"/g, '""')}"`;
const HEAD = ["in_100","rank","character","slug","canonical_age","variant_ages","status_or_reason","breakthrough","title_and_hook","narrative_arc"];
const csv = [HEAD.join(",")].concat(
  out.sort((a, b) => (b.in100 === "YES") - (a.in100 === "YES") || a.bare.localeCompare(b.bare))
     .map(o => [o.in100, o.rank, o.bare, o.slug, o.age, o.vars, o.status, o.breakthrough, o.hook, o.arc].map(q).join(","))
).join("\n");

await fs.writeFile(path.join(ROOT, "TOP 100.csv"), csv + "\n");
await fs.writeFile(path.join(ROOT, "tmp/grok-spike/final-cast.json"), JSON.stringify(out, null, 1) + "\n");

const yes = out.filter(o => o.in100 === "YES");
console.log("rows written:", out.length, "| IN_100:", yes.length, "| excluded:", out.length - yes.length);
console.log("in-cast rows still missing script text:", yes.filter(o => !o.breakthrough).map(o => o.bare).join(", ") || "none");
