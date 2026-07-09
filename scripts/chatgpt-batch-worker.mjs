#!/usr/bin/env node
import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const { validateCanonicalImage } = require("./shared-canonical-image.js");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CHARACTERS_DIR = path.join(ROOT, "data", "characters");
const DEFAULT_PROFILE_DIR = path.join(ROOT, ".iforge", "chatgpt-profile");
const DEBUG_DIR = path.join(ROOT, ".iforge", "debug");
const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_CHECKPOINT_SECONDS = 120;
const CHECKPOINT_POLL_MS = 4_000;
const CHECKPOINT_INSTRUCTION =
  "Open the same Chrome profile manually, let ChatGPT finish checking, confirm the composer is visible, quit Chrome, then rerun the worker.";
const GENERATED_TIMEOUT_MS = Number(process.env.IFORGE_GENERATION_TIMEOUT_MS ?? 8 * 60_000);
const CHANNEL = process.env.IFORGE_BROWSER_CHANNEL || "chrome";

function parseArgs() {
  const args = new Set(process.argv.slice(2));
  const valueAfter = (name, fallback = "") => {
    const index = process.argv.indexOf(name);
    return index === -1 ? fallback : process.argv[index + 1] ?? fallback;
  };

  return {
    character: valueAfter("--character", ""),
    dryRun: args.has("--dry-run"),
    debugAuth: args.has("--debug-auth"),
    headless: args.has("--headless"),
    runAll: args.has("--run-all"),
    watch: args.has("--watch"),
    profileDir: valueAfter("--profile", process.env.IFORGE_CHATGPT_PROFILE_DIR || DEFAULT_PROFILE_DIR),
    intervalMs: Number(valueAfter("--interval-ms", String(DEFAULT_INTERVAL_MS))),
    waitCheckpointSeconds: Number(valueAfter("--wait-checkpoint-seconds", String(DEFAULT_CHECKPOINT_SECONDS)))
  };
}

function nowIso() {
  return new Date().toISOString();
}

function safeTimestamp() {
  return nowIso().replace(/[:.]/g, "-");
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2));
}

function excerpt(text, maxLength = 5_000) {
  return text.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function checkpointTimeoutMs(options) {
  const seconds = Number(options?.waitCheckpointSeconds);
  return (Number.isFinite(seconds) && seconds >= 0 ? seconds : DEFAULT_CHECKPOINT_SECONDS) * 1_000;
}

async function locatorVisible(page, selector) {
  const locator = page.locator(selector);
  if ((await locator.count().catch(() => 0)) === 0) return false;
  return locator.first().isVisible({ timeout: 1_000 }).catch(() => false);
}

async function locatorAttached(page, selector) {
  return (await page.locator(selector).count().catch(() => 0)) > 0;
}

async function inspectChatGptPage(page) {
  const url = page.url();
  const title = await page.title().catch(() => "");
  const bodyText = await page.evaluate(() => document.body?.innerText ?? "").catch(() => "");
  const bodyExcerpt = excerpt(bodyText);
  const hostname = new URL(url).hostname.toLowerCase();
  const isChatGptUrl = hostname === "chatgpt.com" || hostname.endsWith(".chatgpt.com");
  const isAuthUrl = /\/auth\b|\/login\b|\/signup\b|auth0|accounts\.openai\.com/i.test(url);
  const composerSelectors = [
    "#prompt-textarea",
    '[data-testid="composer"] div[contenteditable="true"]',
    'div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"]',
    'textarea[placeholder*="Message" i]',
    "textarea"
  ];
  const attachSelectors = [
    'input[type="file"]',
    '[data-testid="upload-file-button"]',
    'button[aria-label*="Upload" i]',
    'button[aria-label*="Attach" i]',
    'button:has-text("Upload")',
    'button:has-text("Attach")'
  ];
  const sidebarSelectors = [
    '[data-testid="sidebar"]',
    'nav[aria-label*="Chat" i]',
    'a[aria-label*="New chat" i]',
    'button[aria-label*="New chat" i]',
    'a:has-text("New chat")',
    'button:has-text("New chat")'
  ];
  const modelPickerSelectors = [
    '[data-testid="model-switcher-dropdown-button"]',
    'button[aria-label*="Model" i]',
    'button:has-text("ChatGPT")'
  ];

  const composerSelector = (await Promise.all(composerSelectors.map(async (selector) => ((await locatorVisible(page, selector)) ? selector : null)))).find(Boolean);
  const attachSelector = (await Promise.all(attachSelectors.map(async (selector) => ((await locatorAttached(page, selector)) ? selector : null)))).find(Boolean);
  const sidebarSelector = (await Promise.all(sidebarSelectors.map(async (selector) => ((await locatorVisible(page, selector)) ? selector : null)))).find(Boolean);
  const modelPickerSelector = (await Promise.all(modelPickerSelectors.map(async (selector) => ((await locatorVisible(page, selector)) ? selector : null)))).find(Boolean);
  const loginText = /\blog in\b|\bsign up\b|continue with google|continue with microsoft|welcome back/i.test(bodyText);
  const cloudflareText = /checking.*browser|verify you are human|cloudflare|cf-browser-verification|security check|just a moment/i.test(`${title}\n${bodyText}`);
  const cloudflareCondition = cloudflareText
    ? "title/body text matched checking browser|verify you are human|cloudflare|security check|just a moment"
    : null;
  const emptyNewChatText = /ask anything|message chatgpt|what can i help|how can i help/i.test(bodyText);
  const loginScreen = isAuthUrl || (loginText && !composerSelector && !attachSelector && !sidebarSelector);
  const cloudflareScreen = cloudflareText && !composerSelector;
  const loggedIn = isChatGptUrl && !isAuthUrl && !loginScreen && !cloudflareScreen && Boolean(composerSelector || attachSelector || sidebarSelector || modelPickerSelector || emptyNewChatText);
  let state = "unexpected UI";

  if (cloudflareScreen) state = "cloudflare_checkpoint_required";
  else if (loginScreen) state = "login screen";
  else if (composerSelector) state = "logged-in chat composer";
  else if (modelPickerSelector) state = "model picker";
  else if (emptyNewChatText) state = "empty/new chat screen";

  return {
    url,
    title,
    state,
    loggedIn,
    signals: {
      isChatGptUrl,
      isAuthUrl,
      loginScreen,
      cloudflareScreen,
      composerSelector,
      attachSelector,
      sidebarSelector,
      modelPickerSelector,
      cloudflareCondition,
      emptyNewChatText
    },
    failedCondition: loggedIn
      ? null
      : cloudflareScreen
        ? "Cloudflare/checking screen remained visible; operator checkpoint required."
        : "Expected chatgpt.com URL without auth/login plus at least one logged-in signal: composer textarea/contenteditable, attach/upload control, sidebar/new chat UI, model picker, or empty/new chat text.",
    bodyExcerpt
  };
}

async function detectChatGptAuthState(page, options = {}) {
  const authTimeoutMs = typeof options === "number" ? options : options.authTimeoutMs ?? 60_000;
  const checkpointWaitMs = typeof options === "number" ? DEFAULT_CHECKPOINT_SECONDS * 1_000 : options.checkpointTimeoutMs ?? DEFAULT_CHECKPOINT_SECONDS * 1_000;
  const authDeadline = Date.now() + authTimeoutMs;
  let checkpointDeadline = null;
  let detection = await inspectChatGptPage(page);

  while (true) {
    if (detection.loggedIn || detection.state === "login screen") return detection;

    if (detection.state === "cloudflare_checkpoint_required") {
      checkpointDeadline ??= Date.now() + checkpointWaitMs;
      if (Date.now() >= checkpointDeadline) return detection;
      await page.waitForTimeout(Math.min(CHECKPOINT_POLL_MS, Math.max(0, checkpointDeadline - Date.now())));
      detection = await inspectChatGptPage(page);
      continue;
    }

    if (Date.now() >= authDeadline) return detection;
    await page.waitForTimeout(Math.min(2_000, Math.max(0, authDeadline - Date.now())));
    detection = await inspectChatGptPage(page);
  }
}

async function savePageDiagnostics(page, detection, failedSelectorOrCondition, prefix) {
  const diagnosticsPath = path.join(DEBUG_DIR, `${prefix}-${safeTimestamp()}`);
  await fs.mkdir(diagnosticsPath, { recursive: true });
  const screenshotPath = path.join(diagnosticsPath, "screenshot.png");
  const htmlPath = path.join(diagnosticsPath, "html-excerpt.html");
  const bodyPath = path.join(diagnosticsPath, "body-excerpt.txt");
  const metadataPath = path.join(diagnosticsPath, "page-state.json");
  let screenshotError = null;

  try {
    await page.screenshot({ path: screenshotPath, fullPage: true });
  } catch (error) {
    screenshotError = error instanceof Error ? error.message : String(error);
  }

  const html = await page.content().catch(() => "");
  await fs.writeFile(htmlPath, html.slice(0, 10_000));
  await fs.writeFile(bodyPath, detection.bodyExcerpt || "");
  await writeJson(metadataPath, {
    savedAt: nowIso(),
    currentUrl: detection.url,
    pageTitle: detection.title,
    detectedState: detection.state,
    loggedIn: detection.loggedIn,
    signals: detection.signals,
    failedSelectorOrCondition,
    screenshot: screenshotError ? { path: null, error: screenshotError } : { path: "screenshot.png" },
    htmlExcerpt: "html-excerpt.html",
    bodyExcerpt: "body-excerpt.txt"
  });

  return diagnosticsPath;
}

async function saveAuthDiagnostics(page, detection, failedSelectorOrCondition) {
  return savePageDiagnostics(page, detection, failedSelectorOrCondition, "chatgpt-auth");
}

async function saveCheckpointDiagnostics(page, detection, failedSelectorOrCondition) {
  return savePageDiagnostics(page, detection, failedSelectorOrCondition, "chatgpt-cloudflare");
}

async function saveRejectedCapture(bytes, round, validation, captureMethod) {
  const diagnosticsPath = path.join(DEBUG_DIR, `chatgpt-capture-${safeTimestamp()}`);
  await fs.mkdir(diagnosticsPath, { recursive: true });
  await fs.writeFile(path.join(diagnosticsPath, `rejected-${round}.png`), bytes);
  await writeJson(path.join(diagnosticsPath, "validation.json"), {
    savedAt: nowIso(),
    round,
    captureMethod,
    ...validation
  });
  return diagnosticsPath;
}

async function findScheduleFiles(characterFilter) {
  if (!(await exists(CHARACTERS_DIR))) return [];
  const characters = await fs.readdir(CHARACTERS_DIR, { withFileTypes: true });
  const files = [];

  for (const character of characters) {
    if (!character.isDirectory()) continue;
    if (characterFilter && character.name !== characterFilter) continue;
    const batchesDir = path.join(CHARACTERS_DIR, character.name, "batches");
    if (!(await exists(batchesDir))) continue;
    const batches = await fs.readdir(batchesDir, { withFileTypes: true });
    for (const batch of batches) {
      if (!batch.isDirectory()) continue;
      const schedulePath = path.join(batchesDir, batch.name, "schedule.json");
      if (await exists(schedulePath)) files.push(schedulePath);
    }
  }

  return files.sort();
}

function dueRounds(schedule, runAll) {
  const now = Date.now();
  return schedule.rounds.filter((round) => {
    if (round.status === "saved") return false;
    if (round.status === "running") return true;
    if (round.status !== "scheduled" && round.status !== "failed" && round.status !== "checkpoint_required") return false;
    return runAll || new Date(round.plannedAt).getTime() <= now;
  });
}

function characterRoot(schedulePath) {
  return path.resolve(schedulePath, "..", "..", "..");
}

function absoluteBatchPath(schedulePath, relativePath) {
  return path.join(characterRoot(schedulePath), relativePath);
}

async function markRound(schedulePath, schedule, roundIndex, updates) {
  schedule.rounds[roundIndex] = {
    ...schedule.rounds[roundIndex],
    ...updates,
    updatedAt: nowIso()
  };

  const allSaved = schedule.rounds.every((round) => round.status === "saved");
  const anyRunning = schedule.rounds.some((round) => round.status === "running");
  const anyFailed = schedule.rounds.some((round) => round.status === "failed");
  const anyCheckpoint = schedule.rounds.some((round) => round.status === "checkpoint_required");
  schedule.status = allSaved ? "complete" : anyRunning ? "running" : anyFailed || anyCheckpoint ? "scheduled" : schedule.status;
  schedule.updatedAt = nowIso();
  await writeJson(schedulePath, schedule);
}

async function attachReferences(page, referencePaths) {
  const input = page.locator('input[type="file"]').last();
  await input.waitFor({ state: "attached", timeout: 30_000 });
  await input.setInputFiles(referencePaths);
}

async function fillComposer(page, text) {
  const candidates = [
    page.locator("#prompt-textarea"),
    page.locator('[data-testid="composer"] div[contenteditable="true"]'),
    page.locator('div[contenteditable="true"]').last(),
    page.locator("textarea").last()
  ];

  for (const candidate of candidates) {
    if ((await candidate.count()) === 0) continue;
    try {
      await candidate.click({ timeout: 10_000 });
      await candidate.fill(text, { timeout: 10_000 });
      return;
    } catch {
      try {
        await candidate.click({ timeout: 10_000 });
        await page.keyboard.insertText(text);
        return;
      } catch {
        // Try the next composer shape.
      }
    }
  }

  throw new Error("Could not find ChatGPT prompt composer.");
}

async function submitPrompt(page) {
  const buttons = [
    page.locator('[data-testid="send-button"]'),
    page.locator('button[aria-label="Send prompt"]'),
    page.locator('button[aria-label="Send message"]'),
    page.locator('button:has-text("Send")')
  ];

  for (const button of buttons) {
    if ((await button.count()) === 0) continue;
    try {
      await button.last().click({ timeout: 15_000 });
      return;
    } catch {
      // Try the next send button shape.
    }
  }

  await page.keyboard.press("Enter");
}

async function imageSnapshot(page) {
  return page.locator("img").evaluateAll((images) =>
    images.map((img, index) => ({
      index,
      alt: img.alt || "",
      src: img.currentSrc || img.src || "",
      width: img.naturalWidth,
      height: img.naturalHeight
    }))
  );
}

async function waitForGeneratedImage(page, previousSources) {
  const started = Date.now();

  while (Date.now() - started < GENERATED_TIMEOUT_MS) {
    const images = await imageSnapshot(page);
    const candidates = images.filter((image) => {
      if (!image.src || previousSources.has(image.src)) return false;
      if (image.width < 256 || image.height < 256) return false;
      return /blob:|oaiusercontent|openai|chatgpt|data:image/i.test(image.src) || image.alt.toLowerCase().includes("generated");
    });

    if (candidates.length > 0) return candidates[candidates.length - 1];
    await page.waitForTimeout(2_000);
  }

  throw new Error("Timed out waiting for generated image.");
}

async function downloadImage(page, image) {
  try {
    const bytes = await page.evaluate(async (src) => {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`Could not fetch generated image: ${response.status}`);
      const buffer = await response.arrayBuffer();
      return Array.from(new Uint8Array(buffer));
    }, image.src);

    return { bytes: Buffer.from(bytes), captureMethod: "download" };
  } catch {
    const bytes = await page.locator("img").nth(image.index).screenshot();
    return { bytes, captureMethod: "screenshot" };
  }
}

async function openChatGptPage(context, options) {
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto("https://chatgpt.com/", { waitUntil: "domcontentloaded", timeout: 60_000 });
  const detection = await detectChatGptAuthState(page, {
    authTimeoutMs: 60_000,
    checkpointTimeoutMs: checkpointTimeoutMs(options)
  });

  if (!detection.loggedIn) {
    if (detection.state === "cloudflare_checkpoint_required") {
      const diagnosticsPath = await saveCheckpointDiagnostics(page, detection, detection.failedCondition);
      const error = new Error(
        `ChatGPT checkpoint required after waiting ${Math.round(checkpointTimeoutMs(options) / 1_000)} seconds. Diagnostics: ${diagnosticsPath}\n${CHECKPOINT_INSTRUCTION}`
      );
      error.code = "checkpoint_required";
      error.diagnosticsPath = diagnosticsPath;
      error.detection = detection;
      throw error;
    }

    const diagnosticsPath = await saveAuthDiagnostics(page, detection, detection.failedCondition);
    const detail = options?.debugAuth ? ` Diagnostics: ${diagnosticsPath}` : ` Auth diagnostics: ${diagnosticsPath}`;
    throw new Error(`ChatGPT auth check failed. Detected ${detection.state}. ${detection.failedCondition}${detail}`);
  }

  return page;
}

async function processRound(context, schedulePath, schedule, round, options) {
  const roundIndex = schedule.rounds.findIndex((item) => item.round === round.round);
  await markRound(schedulePath, schedule, roundIndex, {
    status: "running",
    startedAt: nowIso(),
    error: null
  });

  const referencePaths = schedule.referenceImages.map((relativePath) => absoluteBatchPath(schedulePath, relativePath));
  const outputPath = absoluteBatchPath(schedulePath, round.generatedImagePath);
  const promptPath = outputPath.replace(/\.[^.]+$/, ".prompt.md");
  const metadataPath = outputPath.replace(/\.[^.]+$/, ".json");
  let capture;

  if (options.dryRun) {
    capture = { bytes: Buffer.from(`DRY RUN IMAGE PLACEHOLDER\n${round.prompt}\n`), captureMethod: null };
  } else {
    const page = await openChatGptPage(context, options);
    const before = new Set((await imageSnapshot(page)).map((image) => image.src));
    await attachReferences(page, referencePaths);
    await fillComposer(page, round.prompt);
    await submitPrompt(page);
    const generatedImage = await waitForGeneratedImage(page, before);
    capture = await downloadImage(page, generatedImage);
  }

  const validation = options.dryRun
    ? { errors: [], warnings: [] }
    : validateCanonicalImage(capture.bytes, path.basename(outputPath));
  const metadata = {
    characterId: schedule.characterId,
    batchId: schedule.id,
    round: round.round,
    prompt: round.prompt,
    promptVersion: round.promptVersion,
    referenceImages: schedule.referenceImages,
    generatedImagePath: round.generatedImagePath,
    source: options.dryRun ? "dry-run" : "chatgpt-web",
    captureMethod: capture.captureMethod
  };

  if (validation.errors.length > 0) {
    await fs.rm(outputPath, { force: true });
    const diagnosticsPath = await saveRejectedCapture(capture.bytes, round.round, validation, capture.captureMethod);
    await fs.mkdir(path.dirname(metadataPath), { recursive: true });
    await fs.writeFile(promptPath, round.prompt);
    await writeJson(metadataPath, {
      ...metadata,
      failedAt: nowIso(),
      validationErrors: validation.errors,
      warnings: validation.warnings,
      diagnosticsPath
    });

    const error = new Error(`Generated image rejected: ${validation.errors.join("; ")}`);
    error.validationErrors = validation.errors;
    error.validationWarnings = validation.warnings;
    error.captureMethod = capture.captureMethod;
    error.diagnosticsPath = diagnosticsPath;
    error.metadataPath = path.relative(characterRoot(schedulePath), metadataPath);
    throw error;
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, capture.bytes);
  await fs.writeFile(promptPath, round.prompt);
  await writeJson(metadataPath, {
    ...metadata,
    savedAt: nowIso(),
    warnings: validation.warnings
  });

  await markRound(schedulePath, schedule, roundIndex, {
    status: "saved",
    savedAt: nowIso(),
    generatedImagePath: round.generatedImagePath,
    promptPath: path.relative(characterRoot(schedulePath), promptPath),
    metadataPath: path.relative(characterRoot(schedulePath), metadataPath),
    warnings: validation.warnings,
    captureMethod: capture.captureMethod
  });
}

async function launchContext(options) {
  if (options.dryRun) return null;
  await fs.mkdir(options.profileDir, { recursive: true });

  try {
    return await chromium.launchPersistentContext(options.profileDir, {
      channel: CHANNEL,
      headless: options.headless,
      acceptDownloads: true,
      viewport: { width: 1440, height: 1000 }
    });
  } catch (error) {
    if (CHANNEL !== "chromium") {
      return chromium.launchPersistentContext(options.profileDir, {
        headless: options.headless,
        acceptDownloads: true,
        viewport: { width: 1440, height: 1000 }
      });
    }
    throw error;
  }
}

async function runAuthDebug(options) {
  const context = await launchContext({ ...options, dryRun: false });
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto("https://chatgpt.com/", { waitUntil: "domcontentloaded", timeout: 60_000 });
    const detection = await detectChatGptAuthState(page, {
      authTimeoutMs: 60_000,
      checkpointTimeoutMs: checkpointTimeoutMs(options)
    });
    const saveDiagnostics = detection.state === "cloudflare_checkpoint_required" ? saveCheckpointDiagnostics : saveAuthDiagnostics;
    const diagnosticsPath = await saveDiagnostics(
      page,
      detection,
      detection.failedCondition ?? "No auth selector failed; debug snapshot requested."
    );

    console.log(`Diagnostics path: ${diagnosticsPath}`);
    console.log(`Detected URL: ${detection.url}`);
    console.log(`Detected page state: ${detection.state}`);
    console.log(`Logged-in: ${detection.loggedIn ? "yes" : "no"}`);
    console.log(`Failed selector/condition: ${detection.failedCondition ?? "none"}`);
    if (detection.state === "cloudflare_checkpoint_required") console.log(`Operator instruction: ${CHECKPOINT_INSTRUCTION}`);
    console.log("Signals:");
    for (const [name, value] of Object.entries(detection.signals)) {
      console.log(`- ${name}: ${value ?? "none"}`);
    }
  } finally {
    await context?.close();
  }
}

async function runOnce(options) {
  const scheduleFiles = await findScheduleFiles(options.character);
  const work = [];

  for (const schedulePath of scheduleFiles) {
    const schedule = await readJson(schedulePath);
    for (const round of dueRounds(schedule, options.runAll)) work.push({ schedulePath, round });
  }

  if (work.length === 0) {
    console.log("No due batch rounds.");
    return;
  }

  const context = await launchContext(options);
  try {
    for (const item of work) {
      const schedule = await readJson(item.schedulePath);
      const currentRound = schedule.rounds.find((round) => round.round === item.round.round);
      if (!currentRound || currentRound.status === "saved") continue;
      console.log(`Running ${schedule.characterId}/${schedule.id} round ${currentRound.round} (${currentRound.promptVersion})`);
      try {
        await processRound(context, item.schedulePath, schedule, currentRound, options);
      } catch (error) {
        const latest = await readJson(item.schedulePath);
        const roundIndex = latest.rounds.findIndex((round) => round.round === currentRound.round);
        const isCheckpoint = error && typeof error === "object" && error.code === "checkpoint_required";
        if (roundIndex !== -1) {
          const updates = {
            status: isCheckpoint ? "checkpoint_required" : "failed",
            error: error instanceof Error ? error.message : String(error),
            failedAt: isCheckpoint ? null : nowIso(),
            checkpointRequiredAt: isCheckpoint ? nowIso() : latest.rounds[roundIndex].checkpointRequiredAt,
            diagnosticsPath: isCheckpoint ? error.diagnosticsPath : latest.rounds[roundIndex].diagnosticsPath
          };
          if (!isCheckpoint && error && typeof error === "object" && Array.isArray(error.validationErrors)) {
            updates.validationErrors = error.validationErrors;
            updates.warnings = error.validationWarnings;
            updates.captureMethod = error.captureMethod;
            updates.diagnosticsPath = error.diagnosticsPath;
            updates.metadataPath = error.metadataPath;
          }
          await markRound(item.schedulePath, latest, roundIndex, updates);
        }
        throw error;
      }
    }
  } finally {
    await context?.close();
  }
}

async function main() {
  const options = parseArgs();
  if (options.debugAuth) {
    await runAuthDebug(options);
    return;
  }

  do {
    await runOnce(options);
    if (!options.watch) break;
    await new Promise((resolve) => setTimeout(resolve, options.intervalMs));
  } while (true);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
