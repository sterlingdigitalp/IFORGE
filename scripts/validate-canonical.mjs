#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { validateCanonicalImage } = require("./shared-canonical-image.js");

function usage() {
  console.error("Usage: node scripts/validate-canonical.mjs <image-path> [--strict-canonical]");
}

async function main() {
  const args = process.argv.slice(2);
  const strictCanonical = args.includes("--strict-canonical");
  const positional = args.filter((arg) => arg !== "--strict-canonical");

  if (positional.length !== 1 || args.some((arg) => arg.startsWith("--") && arg !== "--strict-canonical")) {
    usage();
    process.exitCode = 1;
    return;
  }

  const imagePath = positional[0];
  let bytes;
  try {
    bytes = await fs.readFile(imagePath);
  } catch (error) {
    console.error(`Error: could not read ${imagePath}: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }

  const check = validateCanonicalImage(bytes, path.basename(imagePath));
  const errors = [...check.errors];
  if (strictCanonical && check.width !== undefined && check.height !== undefined && Math.min(check.width, check.height) < 1024) {
    errors.push(`canonical lock requires >=1024px short edge (got ${check.width}x${check.height})`);
  }

  if (errors.length > 0) {
    console.error("Errors:");
    for (const error of errors) console.error(`- ${error}`);
  }
  if (check.warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of check.warnings) console.log(`- ${warning}`);
  }
  if (errors.length === 0) {
    const dimensions = check.width !== undefined && check.height !== undefined ? ` ${check.width}x${check.height}` : "";
    console.log(`OK: ${check.format ?? "raster image"}${dimensions}`);
  }

  process.exitCode = errors.length > 0 ? 1 : 0;
}

main();
