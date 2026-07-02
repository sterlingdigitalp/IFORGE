#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = __dirname;
const slug = process.argv[2];

if (!slug) {
  console.error("Usage: node playwright-launch.js character_slug");
  process.exit(1);
}

const characterDir = path.join(root, "characters", slug);
const promptPath = path.join(characterDir, "prompt.md");
const referencesDir = path.join(characterDir, "references");

if (!fs.existsSync(characterDir)) {
  console.error(`Missing character folder: ${characterDir}`);
  process.exit(1);
}

if (!fs.existsSync(promptPath)) {
  console.error(`Missing prompt: ${promptPath}`);
  process.exit(1);
}

const references = fs.existsSync(referencesDir)
  ? fs.readdirSync(referencesDir)
      .filter((file) => /\.(jpg|jpeg|png|webp)$/i.test(file))
      .map((file) => path.join(referencesDir, file))
  : [];

console.log("Identity Forge launch helper");
console.log(`Character: ${slug}`);
console.log(`Prompt: ${promptPath}`);
console.log(`Reference: ${references[0] || "missing"}`);
console.log("");
console.log("Manual steps:");
console.log("1. Upload the reference image.");
console.log("2. Paste the prompt from the clipboard or prompt.md.");
console.log("3. Generate.");
console.log("4. Save the best image locally.");
console.log("5. Run ./iforge generated <slug> <image_path>.");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (error) {
  console.log("");
  console.log("Playwright is not installed. Opening ChatGPT with the default browser.");
  try {
    execFileSync("open", ["https://chatgpt.com"]);
  } catch (_) {}
  process.exit(0);
}

(async () => {
  const profileDir = path.join(root, ".iforge-browser-profile");
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1400, height: 1000 }
  });
  const page = await context.newPage();
  await page.goto("https://chatgpt.com", { waitUntil: "domcontentloaded" });
  console.log("");
  console.log("Browser launched. Complete generation manually.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
