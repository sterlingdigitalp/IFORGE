#!/usr/bin/env node
/**
 * validate-scorer.mjs
 *
 * Runs styleSignature() (scripts/style-signature.mjs) over the labeled
 * validation set described in the task:
 *   - tmp/grok-spike/refs/           -> PHOTOREAL anchors (all files)
 *   - tmp/grok-spike/out/            -> mixed: no-suffix = PHOTOREAL baseline,
 *                                       einstein/tesla __edit-pixar__* = CARTOON,
 *                                       curie/newton __edit-pixar__*   = MIXED,
 *                                       __gen-ref-pixar__*             = UNLABELED
 *                                       (not covered by the task's label spec,
 *                                       scored and shown but excluded from stats)
 *   - tmp/grok-spike/out2/           -> curie/newton __edit-pixar__* = MIXED
 * probe.png, contact-sheet.html, report.json are ignored.
 *
 * Prints a table sorted by cartoonIndex ascending, computes a separation
 * stat between the PHOTOREAL and CARTOON anchor classes, checks the Newton
 * oil-painting special case, and writes:
 *   tmp/grok-spike/scorer/sorted.html  (visual strip, human eyeball check)
 *   tmp/grok-spike/scorer/report.json (full numeric results)
 *
 * $0, no network. Pure local file reads + pixel math via style-signature.mjs.
 */

import { readdirSync, statSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { styleSignature } from "./style-signature.mjs";

const ROOT = "tmp/grok-spike";
const OUT_DIR = "tmp/grok-spike/scorer";
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png"]);

function listImages(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .filter((f) => IMAGE_EXT.has(extname(f).toLowerCase()))
    .filter((f) => f !== "probe.png")
    .map((f) => join(dir, f))
    .filter((p) => statSync(p).isFile());
}

/**
 * Label rules, applied by directory + filename pattern. See task spec:
 * refs/* -> PHOTOREAL always.
 * out/ + out2/:
 *   einstein|tesla __edit-pixar (with or without a __cN suffix) -> CARTOON
 *   curie|newton   __edit-pixar (with or without a __cN suffix) -> MIXED
 *   __gen-ref-pixar__*                                          -> UNLABELED
 *   no "__" at all (e.g. out/curie.jpg)                         -> PHOTOREAL
 */
function labelFor(dir, filePath) {
  const name = basename(filePath);
  if (dir.endsWith("/refs") || dir === "tmp/grok-spike/refs") return "PHOTOREAL";

  if (/^(einstein|tesla)__edit-pixar/.test(name)) return "CARTOON";
  if (/^(curie|newton)__edit-pixar/.test(name)) return "MIXED";
  if (/__gen-ref-pixar/.test(name)) return "UNLABELED";
  if (!name.includes("__")) return "PHOTOREAL";
  return "UNLABELED";
}

/**
 * Sub-classification within PHOTOREAL, for a more honest breakdown: the
 * refs/ files are genuine photographs/paintings (real sensor grain or canvas
 * texture); the no-suffix out/*.jpg files are AI-generated "photoreal-style"
 * baseline renders (already algorithmically smoothed/retouched). These two
 * behave very differently under a texture metric, so they're reported
 * separately even though the task labels both PHOTOREAL.
 */
function photorealSubtype(dir, filePath) {
  const name = basename(filePath);
  if (dir.endsWith("/refs") || dir === "tmp/grok-spike/refs") {
    return name === "newton.jpg" ? "REAL-PAINTING" : "REAL-PHOTO";
  }
  return "AI-PHOTOREAL-BASELINE";
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const dirs = [join(ROOT, "refs"), join(ROOT, "out"), join(ROOT, "out2")];
  const files = dirs.flatMap((d) => listImages(d).map((p) => ({ dir: d, path: p })));

  console.log(`Found ${files.length} images across ${dirs.length} dirs.\n`);

  const results = [];
  for (const { dir, path } of files) {
    const label = labelFor(dir, path);
    const subtype = label === "PHOTOREAL" ? photorealSubtype(dir, path) : null;
    try {
      const sig = await styleSignature(path);
      results.push({
        file: path,
        label,
        subtype,
        cartoonIndex: sig.cartoonIndex,
        saturation: sig.saturation,
        warmth: sig.warmth,
        contrast: sig.contrast,
        brightness: sig.brightness,
        texture: sig._texture,
        meta: sig._meta,
      });
    } catch (err) {
      console.error(`FAILED to score ${path}: ${err.message}`);
      results.push({ file: path, label, error: err.message });
    }
  }

  const failed = results.filter((r) => r.error);
  const ok = results.filter((r) => !r.error);

  console.log(`Scored OK: ${ok.length}/${results.length}` + (failed.length ? `  (FAILED: ${failed.length})` : ""));
  if (failed.length) {
    for (const f of failed) console.log(`  FAILED: ${f.file}: ${f.error}`);
  }

  // Sort ascending by cartoonIndex (low = cartoon-like, high = photoreal-like)
  ok.sort((a, b) => a.cartoonIndex - b.cartoonIndex);

  // ---- table ----
  const header = [
    "cartoonIndex".padStart(13),
    "label".padEnd(11),
    "subtype".padEnd(21),
    "saturation".padStart(10),
    "warmth".padStart(8),
    "contrast".padStart(9),
    "brightness".padStart(11),
    "file",
  ].join("  ");
  console.log("\n" + header);
  console.log("-".repeat(header.length + 40));
  for (const r of ok) {
    console.log(
      [
        r.cartoonIndex.toFixed(1).padStart(13),
        r.label.padEnd(11),
        (r.subtype || "").padEnd(21),
        r.saturation.toFixed(3).padStart(10),
        r.warmth.toFixed(3).padStart(8),
        r.contrast.toFixed(3).padStart(9),
        r.brightness.toFixed(3).padStart(11),
        r.file,
      ].join("  ")
    );
  }

  function aucStat(highGroup, lowGroup) {
    let concordant = 0;
    let total = 0;
    for (const h of highGroup) {
      for (const l of lowGroup) {
        total++;
        if (h > l) concordant++;
        else if (h === l) concordant += 0.5;
      }
    }
    return total ? concordant / total : NaN;
  }

  // ---- separation stats: CARTOON vs PHOTOREAL (the two hard anchor classes) ----
  const cartoonVals = ok.filter((r) => r.label === "CARTOON").map((r) => r.cartoonIndex);
  const photorealVals = ok.filter((r) => r.label === "PHOTOREAL").map((r) => r.cartoonIndex);
  const mixedVals = ok.filter((r) => r.label === "MIXED").map((r) => r.cartoonIndex);
  const unlabeledVals = ok.filter((r) => r.label === "UNLABELED").map((r) => r.cartoonIndex);

  // Sub-split of PHOTOREAL: genuine photographs/paintings (refs/) vs.
  // AI-generated "photoreal-style" baseline renders (out/*.jpg no-suffix).
  const realPhotoVals = ok.filter((r) => r.subtype === "REAL-PHOTO").map((r) => r.cartoonIndex);
  const aiBaselineVals = ok.filter((r) => r.subtype === "AI-PHOTOREAL-BASELINE").map((r) => r.cartoonIndex);

  const maxCartoon = cartoonVals.length ? Math.max(...cartoonVals) : NaN;
  const minCartoon = cartoonVals.length ? Math.min(...cartoonVals) : NaN;
  const maxPhotoreal = photorealVals.length ? Math.max(...photorealVals) : NaN;
  const minPhotoreal = photorealVals.length ? Math.min(...photorealVals) : NaN;
  const minRealPhoto = realPhotoVals.length ? Math.min(...realPhotoVals) : NaN;
  const maxRealPhoto = realPhotoVals.length ? Math.max(...realPhotoVals) : NaN;
  const minAiBaseline = aiBaselineVals.length ? Math.min(...aiBaselineVals) : NaN;
  const maxAiBaseline = aiBaselineVals.length ? Math.max(...aiBaselineVals) : NaN;

  // gap = how far the lowest PHOTOREAL is above the highest CARTOON.
  // Positive => clean separation with a margin. Negative => overlap (that much).
  const gap = minPhotoreal - maxCartoon;
  const gapRealPhotoOnly = minRealPhoto - maxCartoon;

  const auc = aucStat(photorealVals, cartoonVals);
  const aucRealPhotoOnly = aucStat(realPhotoVals, cartoonVals);

  console.log("\n=== SEPARATION: CARTOON vs PHOTOREAL anchors (all PHOTOREAL, task's literal label) ===");
  console.log(`CARTOON   (n=${cartoonVals.length}) cartoonIndex range: [${minCartoon.toFixed(1)}, ${maxCartoon.toFixed(1)}]`);
  console.log(`PHOTOREAL (n=${photorealVals.length}) cartoonIndex range: [${minPhotoreal.toFixed(1)}, ${maxPhotoreal.toFixed(1)}]`);
  if (gap >= 0) {
    console.log(`GAP: clean separation, margin = ${gap.toFixed(1)} (min PHOTOREAL - max CARTOON)`);
  } else {
    console.log(`GAP: OVERLAP of ${Math.abs(gap).toFixed(1)} units (min PHOTOREAL is BELOW max CARTOON)`);
  }
  console.log(`AUC-style separation stat: ${auc.toFixed(3)} (1.0 = perfect, 0.5 = chance)`);

  console.log("\n=== SEPARATION BREAKDOWN: the PHOTOREAL bucket is NOT homogeneous ===");
  console.log(`  REAL-PHOTO (refs/, n=${realPhotoVals.length}) range: [${minRealPhoto.toFixed(1)}, ${maxRealPhoto.toFixed(1)}]  (genuine B&W photographs, excl. Newton painting -- see special case below)`);
  console.log(`  AI-PHOTOREAL-BASELINE (out/*.jpg no-suffix, n=${aiBaselineVals.length}) range: [${minAiBaseline.toFixed(1)}, ${maxAiBaseline.toFixed(1)}]  (Grok's own "photoreal" generations)`);
  console.log(`  -> against CARTOON [${minCartoon.toFixed(1)}, ${maxCartoon.toFixed(1)}]:`);
  console.log(`     REAL-PHOTO vs CARTOON gap = ${gapRealPhotoOnly.toFixed(1)}, AUC = ${aucRealPhotoOnly.toFixed(3)}`);
  console.log(`     AI-PHOTOREAL-BASELINE overlaps CARTOON range: ${aiBaselineVals.filter((v) => v <= maxCartoon).length}/${aiBaselineVals.length} of the AI baseline images score AT/BELOW the max CARTOON score`);
  console.log(`  READING: cartoonIndex reliably separates real camera/film photographs from stylized renders, but Grok's own "photoreal-style" baseline outputs are already smoothed/retouched enough that several score as low (or lower) than genuinely stylized CARTOON images -- the metric conflates "AI-smoothed photoreal" with "cartoon" in that subset.`);

  console.log("\n=== MIXED / SEMI-REAL placement ===");
  console.log("(compared against CARTOON and the REAL-PHOTO anchors specifically -- the AI-PHOTOREAL-BASELINE\n subset is too self-overlapping with CARTOON to be a meaningful upper anchor here, see above)");
  if (mixedVals.length) {
    const sortedMixed = [...mixedVals].sort((a, b) => a - b);
    console.log(`MIXED (n=${mixedVals.length}) cartoonIndex range: [${sortedMixed[0].toFixed(1)}, ${sortedMixed[sortedMixed.length - 1].toFixed(1)}]`);
    const veryCartoonLike = mixedVals.filter((v) => v <= maxCartoon).length;
    const veryPhotorealLike = mixedVals.filter((v) => v >= minRealPhoto).length;
    const between = mixedVals.length - veryCartoonLike - veryPhotorealLike;
    console.log(`  ${veryCartoonLike} fall at/below the CARTOON max (${maxCartoon.toFixed(1)}) -- read as "very cartoon-like"`);
    console.log(`  ${between} fall strictly between the CARTOON max and REAL-PHOTO min (${minRealPhoto.toFixed(1)}) -- genuinely "in between"`);
    console.log(`  ${veryPhotorealLike} fall at/above the REAL-PHOTO min -- read as "very photoreal-like"`);
  } else {
    console.log("(no MIXED-labeled images found)");
  }

  if (unlabeledVals.length) {
    console.log(`\n(${unlabeledVals.length} UNLABELED images scored and shown in sorted.html, excluded from stats above: gen-ref-pixar recipe wasn't given a label by the task spec)`);
  }

  // ---- Newton oil-painting special case ----
  const newtonRow = ok.find((r) => r.file === join(ROOT, "refs", "newton.jpg"));
  console.log("\n=== SPECIAL CASE: Newton oil painting (refs/newton.jpg) ===");
  if (newtonRow) {
    const rank = ok.indexOf(newtonRow) + 1;
    console.log(`cartoonIndex = ${newtonRow.cartoonIndex.toFixed(1)}  (rank ${rank} of ${ok.length}, ascending = most-cartoon-like first)`);
    const confusedWithCartoon = cartoonVals.length && newtonRow.cartoonIndex <= maxCartoon;
    const confusedWithMixed = mixedVals.length && newtonRow.cartoonIndex <= Math.max(...mixedVals);
    if (confusedWithCartoon) {
      console.log("VERDICT: the painting's cartoonIndex falls WITHIN or BELOW the CARTOON anchor range -- the metric DOES confuse a smooth painting with a cartoon.");
    } else if (confusedWithMixed) {
      console.log("VERDICT: the painting's cartoonIndex falls within the MIXED range, below other PHOTOREAL anchors -- partial confusion (reads more stylized than the photographs, but not as stylized as the CARTOON anchors).");
    } else {
      console.log("VERDICT: the painting's cartoonIndex stays above the CARTOON range -- the metric does NOT confuse it with a cartoon, though check its position relative to the photographic PHOTOREAL anchors above.");
    }
    const photoAnchors = ok.filter((r) => r.label === "PHOTOREAL" && r.file.startsWith(join(ROOT, "refs")) && !r.file.endsWith("newton.jpg"));
    if (photoAnchors.length) {
      const otherMin = Math.min(...photoAnchors.map((r) => r.cartoonIndex));
      console.log(`  For reference, other refs/ (B&W photographs) range down to ${otherMin.toFixed(1)}; Newton painting is ${newtonRow.cartoonIndex < otherMin ? "LOWER (smoother)" : "within/above"} that range.`);
    }
  } else {
    console.log("refs/newton.jpg not found on disk -- cannot evaluate this case.");
  }

  // ---- write report.json ----
  const report = {
    generatedAt: new Date().toISOString(),
    totals: { scored: ok.length, failed: failed.length },
    separation: {
      cartoon: { n: cartoonVals.length, min: minCartoon, max: maxCartoon },
      photoreal: { n: photorealVals.length, min: minPhotoreal, max: maxPhotoreal },
      gap,
      aucStyleStat: auc,
      breakdown: {
        realPhoto: { n: realPhotoVals.length, min: minRealPhoto, max: maxRealPhoto, gapVsCartoon: gapRealPhotoOnly, auc: aucRealPhotoOnly },
        aiPhotorealBaseline: { n: aiBaselineVals.length, min: minAiBaseline, max: maxAiBaseline, overlapsCartoonRange: aiBaselineVals.filter((v) => v <= maxCartoon).length },
      },
    },
    mixedPlacement: mixedVals.length
      ? { n: mixedVals.length, min: Math.min(...mixedVals), max: Math.max(...mixedVals) }
      : null,
    newtonPaintingCase: newtonRow
      ? { cartoonIndex: newtonRow.cartoonIndex, rankAscending: ok.indexOf(newtonRow) + 1, totalScored: ok.length }
      : null,
    results: ok.map(({ file, label, subtype, cartoonIndex, saturation, warmth, contrast, brightness, texture }) => ({
      file,
      label,
      subtype,
      cartoonIndex,
      saturation,
      warmth,
      contrast,
      brightness,
      texture,
    })),
    failed,
  };
  writeFileSync(join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2));
  console.log(`\nWrote ${join(OUT_DIR, "report.json")}`);

  // ---- write sorted.html ----
  const labelColor = {
    PHOTOREAL: "#c0392b",
    MIXED: "#8e6d1f",
    CARTOON: "#1e7a3d",
    UNLABELED: "#666",
  };
  const cards = ok
    .map((r) => {
      const ext = extname(r.file).toLowerCase();
      const mime = ext === ".png" ? "image/png" : "image/jpeg";
      const b64 = readFileSync(r.file).toString("base64");
      const color = labelColor[r.label] || "#666";
      return `<div class="card">
        <img src="data:${mime};base64,${b64}" alt="${basename(r.file)}" />
        <div class="meta">
          <div class="idx">cartoonIndex ${r.cartoonIndex.toFixed(1)}</div>
          <div class="label" style="color:${color}">${r.label}${r.subtype ? ` (${r.subtype})` : ""}</div>
          <div class="file">${basename(r.file)}</div>
          <div class="sub">sat ${r.saturation.toFixed(2)} · warm ${r.warmth.toFixed(2)} · contrast ${r.contrast.toFixed(2)} · bright ${r.brightness.toFixed(2)}</div>
        </div>
      </div>`;
    })
    .join("\n");

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>style-signature validation — sorted by cartoonIndex</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background:#111; color:#eee; margin:0; padding:24px; }
  h1 { font-size:18px; font-weight:600; }
  p.sub { color:#999; font-size:13px; margin-top:-8px;}
  .strip { display:flex; flex-wrap:wrap; gap:14px; }
  .card { width:190px; background:#1b1b1b; border-radius:8px; overflow:hidden; border:1px solid #333; }
  .card img { width:100%; height:190px; object-fit:cover; display:block; background:#000; }
  .meta { padding:8px 10px; }
  .idx { font-weight:700; font-size:13px; }
  .label { font-weight:700; font-size:12px; text-transform:uppercase; letter-spacing:0.03em; }
  .file { font-size:11px; color:#aaa; word-break:break-all; margin-top:2px; }
  .sub { font-size:10px; color:#888; margin-top:4px; }
</style>
</head>
<body>
  <h1>style-signature: sorted by cartoonIndex (ascending = most cartoon-like first)</h1>
  <p class="sub">Generated ${new Date().toISOString()} · ${ok.length} images scored, ${failed.length} failed</p>
  <div class="strip">
${cards}
  </div>
</body>
</html>`;
  writeFileSync(join(OUT_DIR, "sorted.html"), html);
  console.log(`Wrote ${join(OUT_DIR, "sorted.html")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
