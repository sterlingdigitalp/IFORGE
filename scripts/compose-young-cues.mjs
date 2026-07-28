import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = "/Users/sterlingdigital/IFORGE";
const tri = JSON.parse(await fs.readFile(path.join(ROOT, "tmp/grok-spike/young-cue-triage.json"), "utf8"));

// Phrase fragments that DEMONSTRABLY worked in the pilot. Comparatives were ignored
// ("noticeably shorter hair" twice); these are concrete physical descriptions.
const BEARD_FULL = "the beard cropped very close and short against the jawline, barely more than heavy stubble, rather than full and bushy";
const BEARD_SOME = "the beard cropped short and close against the jawline";
const HAIRLINE   = "thick hair growing full and low across the entire hairline with NO recession at the temples and no high bared forehead";
const SHORTCUT   = "the hair cut CLOSE and SHORT — cropped above the ears and above the collar, clearly and obviously shorter than the reference's long hair";
const CHEEKS     = "no hollowing beneath the cheekbones, since a young face still carries soft fullness in the cheeks";
const FOREHEAD   = "a completely smooth unlined forehead with no horizontal creases at all and no vertical lines between the brows";

// The short-crop lever is a MALE period haircut. Applying it to the women of the cast
// would produce anachronistic nonsense (a 1900s Marie Curie with a modern crew cut), so
// they get a period-appropriate youth lever instead: a softer, looser dressing of the
// same long hair, which reads younger without changing era or gender presentation.
const WOMEN = new Set(["marie_curie","ada_lovelace","florence_nightingale","hypatia",
                       "emmy_noether","rosalind_franklin","barbara_mcclintock"]);
const SOFTER = "the same long hair dressed more softly and loosely, with a little of it falling free to frame the face, rather than scraped severely back — keep the period style, do NOT cut it short";

const out = [];
for (const r of tri.rows) {
  const bits = [];
  if (r.beard === "FULL") bits.push(BEARD_FULL);
  else if (r.beard === "trimmed" || r.beard === "beard") bits.push(BEARD_SOME);
  if (r.hair === "RECEDING/BALD") bits.push(HAIRLINE);
  if (r.hair === "LONG") bits.push(WOMEN.has(r.slug) ? SOFTER : SHORTCUT);
  bits.push(FOREHEAD, CHEEKS);              // universal, per DD's wrinkle finding
  out.push({
    slug: r.slug, name: r.name, anchor: r.age,
    bucket: r.bucket,
    // Provisional young target: DD supplies the real number from each script's age range.
    // anchor-15 floored at 25 matches the shape of DD's pilot targets.
    provisional_target: Math.max(25, r.age - 15),
    youngNote: bits.join("; "),
  });
}

await fs.writeFile(path.join(ROOT, "tmp/grok-spike/young-cues-draft.json"),
  JSON.stringify({ schema: "iforge_young_cues.v1",
    note: "youngNote per character, composed from pilot-proven concrete phrasings. provisional_target is a placeholder — REPLACE with DD's per-character script age before generating.",
    rows: out }, null, 2) + "\n");

const by = {};
for (const r of out) (by[r.bucket] ||= []).push(r);
console.log("composed youngNote for", out.length, "characters\n");
for (const [k, v] of Object.entries(by)) console.log(` ${k}: ${v.length}`);
console.log("\nsample — Aristotle (full beard + receding):");
console.log("  " + out.find(r => r.slug === "aristotle").youngNote);
console.log("\nsample — Marie Curie (long hair):");
console.log("  " + out.find(r => r.slug === "marie_curie").youngNote);
console.log("\nsample — Alan Turing (no lever, wrinkles only):");
console.log("  " + out.find(r => r.slug === "alan_turing").youngNote);
