const path = require("path");

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2]);

function validateCanonicalImage(bytes, filename) {
  const errors = [];
  const warnings = [];
  const format = sniffFormat(bytes);

  if (!format) {
    errors.push(unsupportedContentError(bytes));
    return { ok: false, errors, warnings };
  }

  const extension = path.extname(filename).toLowerCase();
  const extensionFormat = extension === ".png"
    ? "png"
    : extension === ".jpg" || extension === ".jpeg"
      ? "jpeg"
      : extension === ".webp"
        ? "webp"
        : undefined;
  if (extensionFormat !== format) {
    errors.push(`extension mismatch: content is ${format} but filename extension is ${extension || "(none)"}`);
  }

  const dimensions = format === "png"
    ? parsePng(bytes)
    : format === "jpeg"
      ? parseJpeg(bytes)
      : parseWebP(bytes);

  if (!dimensions) {
    errors.push(`unable to parse ${format.toUpperCase()} dimensions from image header`);
    return { ok: false, errors, warnings, format };
  }

  const { width, height, hasAlpha } = dimensions;
  const shortEdge = Math.min(width, height);
  const longEdge = Math.max(width, height);
  if (shortEdge < 512) {
    errors.push(`too small (${width}x${height}); canonical images need >=1024px short edge (hard floor 512)`);
  } else if (shortEdge < 1024) {
    warnings.push(`below recommended size (${width}x${height}); canonical images should have >=1024px short edge`);
  }
  if (longEdge > 2048) {
    warnings.push(`oversized (${width}x${height}); long edge >2048px and will be downsampled`);
  }
  if (hasAlpha) {
    warnings.push("alpha channel present; flatten to an opaque background");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    format,
    width,
    height,
    hasAlpha,
  };
}

function sniffFormat(bytes) {
  if (bytes.length >= PNG_SIGNATURE.length && bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return "png";
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return "jpeg";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "webp";
  return undefined;
}

function unsupportedContentError(bytes) {
  const text = bytes.subarray(0, 1024).toString("utf8").replace(/^\uFEFF/, "").trimStart().toLowerCase();
  if (/^<svg\b/.test(text) || (/^<\?xml\b/.test(text) && /<svg\b/.test(text))) {
    return "not a supported raster image (content appears to be SVG text, not raster)";
  }
  if (/^<!doctype\s+html\b/.test(text) || /^<html\b/.test(text)) {
    return "not a supported raster image (content appears to be HTML text, not raster)";
  }
  if (/^<\?xml\b/.test(text)) {
    return "not a supported raster image (content appears to be XML text, not raster)";
  }
  return "not a supported raster image (content is not PNG/JPEG/WebP)";
}

function parsePng(bytes) {
  if (bytes.length < 26 || bytes.toString("ascii", 12, 16) !== "IHDR") return undefined;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width === 0 || height === 0) return undefined;
  const colorType = bytes[25];
  return { width, height, hasAlpha: colorType === 4 || colorType === 6 };
}

function parseJpeg(bytes) {
  let offset = 2;
  while (offset < bytes.length) {
    while (offset < bytes.length && bytes[offset] !== 0xff) offset += 1;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;

    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xda || offset + 2 > bytes.length) break;

    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
    if (JPEG_SOF_MARKERS.has(marker) && segmentLength >= 8) {
      const height = bytes.readUInt16BE(offset + 3);
      const width = bytes.readUInt16BE(offset + 5);
      if (width === 0 || height === 0) return undefined;
      return { width, height, hasAlpha: false };
    }
    offset += segmentLength;
  }
  return undefined;
}

function parseWebP(bytes) {
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkType = bytes.toString("ascii", offset, offset + 4);
    const chunkSize = bytes.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;

    if (chunkType === "VP8X" && chunkSize >= 10 && dataOffset + 10 <= bytes.length) {
      const width = readUInt24LE(bytes, dataOffset + 4) + 1;
      const height = readUInt24LE(bytes, dataOffset + 7) + 1;
      return { width, height, hasAlpha: (bytes[dataOffset] & 0x10) !== 0 };
    }
    if (chunkType === "VP8 " && chunkSize >= 10 && dataOffset + 10 <= bytes.length) {
      if (bytes[dataOffset + 3] !== 0x9d || bytes[dataOffset + 4] !== 0x01 || bytes[dataOffset + 5] !== 0x2a) return undefined;
      const width = bytes.readUInt16LE(dataOffset + 6) & 0x3fff;
      const height = bytes.readUInt16LE(dataOffset + 8) & 0x3fff;
      if (width === 0 || height === 0) return undefined;
      return { width, height, hasAlpha: false };
    }
    if (chunkType === "VP8L" && chunkSize >= 5 && dataOffset + 5 <= bytes.length) {
      if (bytes[dataOffset] !== 0x2f) return undefined;
      const headerBits = bytes.readUInt32LE(dataOffset + 1);
      const width = (headerBits & 0x3fff) + 1;
      const height = ((headerBits >>> 14) & 0x3fff) + 1;
      return { width, height, hasAlpha: ((headerBits >>> 28) & 1) === 1 };
    }

    const nextOffset = dataOffset + chunkSize + (chunkSize % 2);
    if (nextOffset <= offset || nextOffset > bytes.length) break;
    offset = nextOffset;
  }
  return undefined;
}

function readUInt24LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

module.exports = { validateCanonicalImage };
