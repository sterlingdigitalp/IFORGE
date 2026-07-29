import { promises as fs } from "node:fs";

const CSV = "/Users/sterlingdigital/IFORGE/TOP 100.csv";
const text = await fs.readFile(CSV, "utf8");

// strict RFC4180 parse
const rows = [];
let cur = [""], q = false;
for (let i = 0; i < text.length; i++) {
  const ch = text[i];
  if (q) {
    if (ch === '"' && text[i + 1] === '"') { cur[cur.length - 1] += '"'; i++; }
    else if (ch === '"') q = false;
    else cur[cur.length - 1] += ch;
  } else if (ch === '"') q = true;
  else if (ch === ",") cur.push("");
  else if (ch === "\n") { rows.push(cur); cur = [""]; }
  else if (ch !== "\r") cur[cur.length - 1] += ch;
}
if (cur.length > 1 || cur[0]) rows.push(cur);

const head = rows[0];
const data = rows.slice(1).filter(r => r.some(c => c !== ""));
const col = Object.fromEntries(head.map((h, i) => [h, i]));

console.log("HEADERS:", head.join(" | "));
console.log("data rows:", data.length);

const fail = [];
const ok = m => console.log("  ✓ " + m);
const bad = (m, rowsList = []) => { fail.push(m); console.log("  ✗ " + m); rowsList.slice(0,6).forEach(r => console.log("       " + r)); };

// ---- 1. column count integrity
const wrong = data.filter(r => r.length !== head.length);
wrong.length ? bad(`${wrong.length} rows have wrong column count`, wrong.map(r => r[2]))
             : ok(`every row has exactly ${head.length} columns`);

// ---- 2. exactly 100 in the cast
const inCast = data.filter(r => r[col.in_100] === "YES");
inCast.length === 100 ? ok("exactly 100 rows marked in_100 = YES")
                      : bad(`in_100=YES count is ${inCast.length}, expected 100`);

// ---- 3. no pairs / duos / groups
const PAIR = /\s&\s| and |\bbrothers\b|,\s*(?:walter|carl|charles|emmanuelle|jacques|wilbur|orville)\b/i;
const pairs = inCast.filter(r => PAIR.test(r[col.character]));
pairs.length ? bad(`${pairs.length} cast rows look like pairs/groups`, pairs.map(r => r[col.character]))
             : ok("no pairs, duos or groups — every cast row is one individual");

// ---- 4. one row per person, no duplicates
const names = inCast.map(r => r[col.character].trim().toLowerCase());
const dupN = names.filter((n, i) => names.indexOf(n) !== i);
dupN.length ? bad("duplicate character names", [...new Set(dupN)]) : ok("no duplicate character names");
const slugs = inCast.map(r => r[col.slug]);
const dupS = slugs.filter((s, i) => slugs.indexOf(s) !== i);
dupS.length ? bad("duplicate slugs", [...new Set(dupS)]) : ok("no duplicate slugs");

// ---- 5. every cast row maps to a real directory
const dirs = new Set((await fs.readdir("/Users/sterlingdigital/IFORGE/characters", { withFileTypes: true }))
  .filter(e => e.isDirectory()).map(e => e.name));
const noDir = inCast.filter(r => !dirs.has(r[col.slug]));
noDir.length ? bad("cast rows with no character directory", noDir.map(r => r[col.character]))
             : ok("all 100 slugs resolve to a real character directory");
const noRow = [...dirs].filter(d => !slugs.includes(d));
noRow.length ? bad("directories with no cast row", noRow) : ok("no orphan directories — the sets match exactly");

// ---- 6. FIELD ALIGNMENT: does each field contain what its header promises?
const mis = { breakthrough: [], hook: [], arc: [], age: [] };
for (const r of inCast) {
  const name = r[col.character], b = r[col.breakthrough], h = r[col.title_and_hook], a = r[col.narrative_arc];
  // breakthrough: a descriptive sentence; must NOT be a quoted title, must not carry hook/story markers
  if (!b || /^["“]/.test(b.trim()) || /\bThe (Hook|Story):/i.test(b)) mis.breakthrough.push(`${name}: ${b.slice(0,70)}`);
  // title/hook: a headline, normally quoted; must not contain the arc markers
  if (!h || /\bThe (Hook|Story):/i.test(h)) mis.hook.push(`${name}: ${h.slice(0,70)}`);
  // arc: the long strategy text; should contain a Hook or Story marker
  if (!a || !/\b(The Hook|The Story|Hook:|Story:)/i.test(a)) mis.arc.push(`${name}: ${a.slice(0,70)}`);
  // canonical_age must be a plausible integer
  const ag = Number(r[col.canonical_age]);
  if (!Number.isInteger(ag) || ag < 5 || ag > 100) mis.age.push(`${name}: ${r[col.canonical_age]}`);
}
for (const [k, v] of Object.entries(mis))
  v.length ? bad(`${v.length} rows where '${k}' does not match its heading`, v) : ok(`'${k}' field content matches its heading in all 100 rows`);

// ---- 7. excluded rows all carry a reason
const out = data.filter(r => r[col.in_100] === "NO");
const noReason = out.filter(r => !r[col.status_or_reason]);
noReason.length ? bad("excluded rows with no reason", noReason.map(r => r[col.character]))
                : ok(`all ${out.length} excluded rows carry a reason`);

console.log(fail.length ? `\nFAILED ${fail.length} check(s)` : "\nALL CHECKS PASSED");
if (fail.length) process.exit(1);
