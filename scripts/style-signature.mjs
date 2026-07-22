#!/usr/bin/env node
/**
 * style-signature.mjs
 *
 * Offline, $0, no-network "style signature" for a single image: how stylized
 * (cartoon) vs. photoreal does it look? Pure local pixel analysis, no model
 * calls. Used to pre-filter/rank Grok candidates before a human picks the
 * on-model one.
 *
 * Dependency note: `sharp` was already present in node_modules (this is a
 * Next.js app and sharp is a common transitive/optional dep for image
 * pipelines) — confirmed via `node -e "require('sharp')"` before writing this
 * file, so nothing was added to package.json. If sharp is ever removed, the
 * fallback would be `jpeg-js` + `pngjs` (pure JS, no native build step).
 *
 * ---------------------------------------------------------------------------
 * cartoonIndex: which proxy, and why
 * ---------------------------------------------------------------------------
 * Photoreal faces (photos, and it turns out oil paintings too) carry
 * meaningful high-frequency energy from skin pores, film grain, brush/canvas
 * texture, or JPEG micro-noise. Stylized/cartoon faces are rendered with flat
 * shading and smooth gradients -- very little energy above low spatial
 * frequencies. So "how much high-frequency energy is in the image" is the
 * signal, measured on a CENTER CROP (~45% of width/height, centered) so the
 * measurement is biased toward skin/face rather than background clutter or
 * frizzy hair strands (which are highly textured in cartoons too and would
 * pollute the signal).
 *
 * Three proxies were implemented and compared empirically against the
 * labeled validation set in validate-scorer.mjs:
 *   (a) varLaplacian   - variance of the discrete Laplacian response
 *                        (classic "blur detection" measure; Pech-Pacheco et al.)
 *   (b) meanAbsHighPass - mean absolute value of (pixel - local 3x3 blur),
 *                        i.e. mean high-pass energy
 *   (c) gradEnergy      - mean Sobel gradient magnitude (edge energy)
 *
 * All three are computed as PER-PIXEL averages (variance / mean, not raw
 * sums), so they are already comparable across images of different crop
 * sizes -- no additional normalization needed for that part.
 *
 * RESULT of the comparison (see validate-scorer.mjs output): varLaplacian
 * gave the cleanest separation between the CARTOON and PHOTOREAL anchors of
 * the three (biggest gap relative to within-class spread), so it was chosen
 * as `cartoonIndex`. The other two are still computed and exposed under
 * `_texture` for transparency / future re-tuning -- they are not part of the
 * required 5-field shape but cost nothing extra since they share the same
 * crop and grayscale buffer.
 *
 * `cartoonIndex` is left in its natural units (grayscale variance of the
 * Laplacian, roughly 0-2000+ for 0-255 imagery). Lower = smoother = more
 * cartoon; higher = more textured = more photoreal. No further rescaling is
 * applied because the raw units are already what most blur-detection
 * literature reports and rescaling would just hide the actual numbers this
 * task asked to report honestly.
 * ---------------------------------------------------------------------------
 */

import sharp from "sharp";

const MAX_DIM = 640; // resize longest side to this before analysis, for cheap+consistent cost
const CROP_FRACTION = 0.46; // center box covers ~46% of width and height

/**
 * Decode an image to a flat sRGB raw buffer (no alpha), resized so the
 * longest side is MAX_DIM (keeps aspect ratio, never enlarges).
 */
async function decodeRaw(imagePath) {
  const { data, info } = await sharp(imagePath)
    .rotate() // respect EXIF orientation
    .resize({ width: MAX_DIM, height: MAX_DIM, fit: "inside", withoutEnlargement: true })
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

/** Grayscale (luma) Float64Array from an interleaved RGB buffer. */
function toGray(data, width, height, channels) {
  const gray = new Float64Array(width * height);
  for (let i = 0, p = 0; i < width * height; i++, p += channels) {
    gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }
  return gray;
}

/** Extract a centered sub-rectangle of a flat grayscale array. */
function centerCropGray(gray, width, height, fraction) {
  const cw = Math.max(2, Math.round(width * fraction));
  const ch = Math.max(2, Math.round(height * fraction));
  const x0 = Math.floor((width - cw) / 2);
  const y0 = Math.floor((height - ch) / 2);
  const out = new Float64Array(cw * ch);
  for (let y = 0; y < ch; y++) {
    const srcRow = (y0 + y) * width;
    const dstRow = y * cw;
    for (let x = 0; x < cw; x++) {
      out[dstRow + x] = gray[srcRow + x0 + x];
    }
  }
  return { crop: out, cw, ch };
}

function mean(arr) {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}

function variance(arr) {
  const m = mean(arr);
  let s = 0;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i] - m;
    s += d * d;
  }
  return s / arr.length;
}

/** Proxy (a): variance of the discrete Laplacian over interior pixels. */
function varLaplacian(crop, cw, ch) {
  const lap = [];
  for (let y = 1; y < ch - 1; y++) {
    for (let x = 1; x < cw - 1; x++) {
      const i = y * cw + x;
      const v =
        -4 * crop[i] + crop[i - 1] + crop[i + 1] + crop[i - cw] + crop[i + cw];
      lap.push(v);
    }
  }
  return variance(lap);
}

/** Proxy (b): mean absolute high-pass response (pixel minus local 3x3 mean). */
function meanAbsHighPass(crop, cw, ch) {
  let total = 0;
  let count = 0;
  for (let y = 1; y < ch - 1; y++) {
    for (let x = 1; x < cw - 1; x++) {
      const i = y * cw + x;
      const blur =
        (crop[i - cw - 1] + crop[i - cw] + crop[i - cw + 1] +
          crop[i - 1] + crop[i] + crop[i + 1] +
          crop[i + cw - 1] + crop[i + cw] + crop[i + cw + 1]) / 9;
      total += Math.abs(crop[i] - blur);
      count++;
    }
  }
  return total / count;
}

/** Proxy (c): mean Sobel gradient magnitude. */
function gradEnergy(crop, cw, ch) {
  let total = 0;
  let count = 0;
  for (let y = 1; y < ch - 1; y++) {
    for (let x = 1; x < cw - 1; x++) {
      const i = y * cw + x;
      const tl = crop[i - cw - 1], t = crop[i - cw], tr = crop[i - cw + 1];
      const l = crop[i - 1], r = crop[i + 1];
      const bl = crop[i + cw - 1], b = crop[i + cw], br = crop[i + cw + 1];
      const gx = tl + 2 * l + bl - (tr + 2 * r + br);
      const gy = tl + 2 * t + tr - (bl + 2 * b + br);
      total += Math.sqrt(gx * gx + gy * gy);
      count++;
    }
  }
  return total / count;
}

/** Mean HSV saturation over the full (resized) image, in [0,1]. */
function meanSaturation(data, width, height, channels) {
  let total = 0;
  const n = width * height;
  for (let i = 0, p = 0; i < n; i++, p += channels) {
    const r = data[p] / 255, g = data[p + 1] / 255, b = data[p + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    total += max === 0 ? 0 : (max - min) / max;
  }
  return total / n;
}

/** Warmth proxy: mean(R) - mean(B), normalized to [-1, 1]. */
function warmthProxy(data, width, height, channels) {
  let rTotal = 0, bTotal = 0;
  const n = width * height;
  for (let i = 0, p = 0; i < n; i++, p += channels) {
    rTotal += data[p];
    bTotal += data[p + 2];
  }
  return (rTotal - bTotal) / n / 255;
}

/**
 * Compute the style signature for one image on disk.
 * @param {string} imagePath
 * @returns {Promise<{cartoonIndex:number, saturation:number, warmth:number,
 *   contrast:number, brightness:number, _texture:{varLaplacian:number,
 *   meanAbsHighPass:number, gradEnergy:number}, _meta:object}>}
 */
export async function styleSignature(imagePath) {
  const { data, width, height, channels } = await decodeRaw(imagePath);
  const gray = toGray(data, width, height, channels);
  const { crop, cw, ch } = centerCropGray(gray, width, height, CROP_FRACTION);

  const texVarLap = varLaplacian(crop, cw, ch);
  const texHighPass = meanAbsHighPass(crop, cw, ch);
  const texGrad = gradEnergy(crop, cw, ch);

  const saturation = meanSaturation(data, width, height, channels);
  const warmth = warmthProxy(data, width, height, channels);
  const brightness = mean(gray) / 255;
  const contrast = Math.sqrt(variance(gray)) / 255; // RMS contrast

  return {
    // chosen proxy -- see header comment for why varLaplacian won
    cartoonIndex: texVarLap,
    saturation,
    warmth,
    contrast,
    brightness,
    _texture: {
      varLaplacian: texVarLap,
      meanAbsHighPass: texHighPass,
      gradEnergy: texGrad,
    },
    _meta: { width, height, cropWidth: cw, cropHeight: ch },
  };
}

export default styleSignature;

// Allow `node scripts/style-signature.mjs <image>` for quick manual checks.
if (import.meta.url === `file://${process.argv[1]}`) {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: node scripts/style-signature.mjs <image-path>");
    process.exit(1);
  }
  const sig = await styleSignature(path);
  console.log(JSON.stringify(sig, null, 2));
}
