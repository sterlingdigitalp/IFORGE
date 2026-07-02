IFORGE - PLAN

Build a tiny local “Identity Forge runner”:
/input_refs/
  newton.jpg
  archimedes.jpg

/prompts/
  pixaresque_master.txt

/output/
  newton/
    prompt.txt
    generated_01.png

Automation flow:
Open chatgpt.com
↓
Start new chat
↓
Upload reference image
↓
Paste master prompt
↓
Wait for generated image
↓
Save/download image manually or semi-automatically
↓
Move to next reference

Use Playwright with persistent browser profile.

mkdir identity-forge-browser
cd identity-forge-browser
npm init -y
npm i playwright
npx playwright install chromium

const { chromium } = require("playwright");
const path = require("path");

const referenceImage = "/Users/sterlingdigital/IdentityForge/input_refs/newton.jpg";

const prompt = `
A photorealistic, highly detailed 3D cinematic portrait of Isaac Newton,
based on the attached reference image. Preserve the same facial structure,
large expressive brown eyes, gray-white hair, and historical clothing.
Remove engraving, brushstroke, black-and-white, and old-photo artifacts.
Render as a full-color Pixaresque cinematic character: expressive but not silly,
realistic skin, soft volumetric lighting, vibrant saturated colors,
historical study background, shallow depth of field.
`;

(async () => {
  const browser = await chromium.launchPersistentContext(
    "/Users/sterlingdigital/IdentityForge/chatgpt-profile",
    {
      headless: false,
      viewport: { width: 1400, height: 1000 }
    }
  );

  const page = await browser.newPage();
  await page.goto("https://chatgpt.com", { waitUntil: "domcontentloaded" });

  console.log("Log in manually if needed, then press Enter here.");
  process.stdin.once("data", async () => {
    const fileInput = page.locator('input[type="file"]').first();

    await page.keyboard.press("Meta+K").catch(() => {});
    await page.waitForTimeout(1000);

    await fileInput.setInputFiles(referenceImage);

    await page.waitForTimeout(3000);
    await page.locator('textarea, [contenteditable="true"]').last().fill(prompt);
    await page.keyboard.press("Enter");

    console.log("Submitted. Watch browser for result.");
  });
})();


node run-chatgpt.js

The safer MVP

1. Pick historical figure
2. Load reference image
3. Generate perfect prompt
4. Open ChatGPT with image attached
5. Submit
6. Human saves winning image
7. App records canonical image + prompt + notes