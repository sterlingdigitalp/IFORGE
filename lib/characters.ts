import { promises as fs } from "fs";
import crypto from "crypto";
import path from "path";
import { preflightCanonicalImage, validateForCanonicalLock } from "@/lib/canonical-image";

const packageJson = require("../package.json") as { version: string };

export type CharacterRecord = {
  id: string;
  name: string;
  prompt: string;
  activePromptVersion: string;
  generatedPromptVersion: string | null;
  canonicalPromptVersion: string | null;
  notes: string;
  referenceImage: string | null;
  generatedImage: string | null;
  canonicalImage: string | null;
  approved: boolean;
};

export type BatchSchedule = {
  id: string;
  characterId: string;
  status: "scheduled";
  startAt: string;
  intervalMinutes: number;
  referenceImages: string[];
  rounds: Array<{
    round: number;
    prompt: string;
    promptVersion: string;
    plannedAt: string;
    status: "scheduled";
    generatedImagePath: string;
  }>;
  createdAt: string;
};

type CharacterMeta = {
  name?: string;
  prompt?: string;
  generatedPromptVersion?: string | null;
  generatedPrompt?: string | null;
  canonicalPromptVersion?: string | null;
  winningPrompt?: string | null;
  notes?: string;
};

type BatchCandidateMetadata = {
  characterId?: string;
  batchId?: string;
  round?: number;
  prompt?: string;
  promptVersion?: string;
  referenceImages?: string[];
  generatedImagePath?: string;
  savedAt?: string;
  source?: string;
};

type ApprovalMetadata = {
  image?: string;
};

const DATA_ROOT = path.join(process.cwd(), "data", "characters");
const PROJECT_ROOT = process.cwd();
const LOOP_CHARACTERS_ROOT = path.join(PROJECT_ROOT, "characters");
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);
const DEFAULT_QUEUE = ["einstein", "tesla", "curie", "newton"];

export function promptVersion(prompt: string) {
  const digest = crypto.createHash("sha256").update(prompt.trim()).digest("hex").slice(0, 8).toUpperCase();
  return `P-${digest}`;
}

async function pathExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function firstImage(folder: string) {
  if (!(await pathExists(folder))) return null;
  const names = await fs.readdir(folder);
  const image = names.sort().find((name) => IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()));
  return image ? path.join(folder, image) : null;
}

async function canonicalImage(folder: string) {
  const approval = await readJson<ApprovalMetadata>(path.join(folder, "approval.json"), {});
  if (approval.image && path.basename(approval.image) === approval.image) {
    const approvedImage = path.join(folder, approval.image);
    if (IMAGE_EXTENSIONS.has(path.extname(approvedImage).toLowerCase()) && (await pathExists(approvedImage))) {
      return approvedImage;
    }
  }
  return firstImage(folder);
}

async function writeImmutable(filePath: string, contents: Buffer | string) {
  try {
    await fs.writeFile(filePath, contents, { flag: "wx" });
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
  }
}

function fileUrl(filePath: string | null) {
  if (!filePath) return null;
  const relative = path.relative(DATA_ROOT, filePath).split(path.sep).map(encodeURIComponent).join("/");
  return `/api/files?path=${relative}`;
}

function resolveProjectFile(filePath: string) {
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(PROJECT_ROOT, filePath);
  const relative = path.relative(PROJECT_ROOT, fullPath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Batch output path must be inside the Identity Forge project.");
  }

  return fullPath;
}

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "batch";
}

export async function listCharacters(): Promise<CharacterRecord[]> {
  await fs.mkdir(DATA_ROOT, { recursive: true });
  const entries = await fs.readdir(DATA_ROOT, { withFileTypes: true });
  const characters = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const id = entry.name;
        const root = path.join(DATA_ROOT, id);
        const meta = await readJson<CharacterMeta>(path.join(root, "character.json"), {});
        const reference = await firstImage(path.join(root, "references"));
        const generated = await firstImage(path.join(root, "generated"));
        const canonical = await canonicalImage(path.join(root, "canonical"));
        const prompt = meta.prompt ?? "";

        return {
          id,
          name: meta.name ?? id.replaceAll("-", " ").replace(/\b\w/g, (match) => match.toUpperCase()),
          prompt,
          activePromptVersion: promptVersion(prompt),
          generatedPromptVersion: meta.generatedPromptVersion ?? null,
          canonicalPromptVersion: meta.canonicalPromptVersion ?? null,
          notes: meta.notes ?? "",
          referenceImage: fileUrl(reference),
          generatedImage: fileUrl(generated),
          canonicalImage: fileUrl(canonical),
          approved: Boolean(canonical)
        };
      })
  );

  return characters.sort((a, b) => {
    const aIndex = DEFAULT_QUEUE.indexOf(a.id);
    const bIndex = DEFAULT_QUEUE.indexOf(b.id);

    if (aIndex !== -1 || bIndex !== -1) {
      return (aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex);
    }

    return a.name.localeCompare(b.name);
  });
}

export async function getCharacter(id: string) {
  const characters = await listCharacters();
  return characters.find((character) => character.id === id) ?? null;
}

export async function updateCharacterText(id: string, text: Pick<CharacterRecord, "prompt" | "notes">) {
  const root = path.join(DATA_ROOT, id);
  const current = await readJson<CharacterMeta>(path.join(root, "character.json"), {});
  const next = { ...current, prompt: text.prompt, notes: text.notes };
  await fs.writeFile(path.join(root, "character.json"), JSON.stringify(next, null, 2));
  return getCharacter(id);
}

export async function approveCharacter(id: string) {
  const root = path.join(DATA_ROOT, id);
  const metaPath = path.join(root, "character.json");
  const meta = await readJson<CharacterMeta>(metaPath, {});
  const prompt = meta.prompt ?? "";
  const activePromptVersion = promptVersion(prompt);
  const generated = await firstImage(path.join(root, "generated"));
  if (!generated) {
    throw new Error("No generated image found.");
  }
  if (!prompt.trim()) {
    throw new Error("Active prompt is empty.");
  }
  if (meta.generatedPromptVersion !== activePromptVersion) {
    throw new Error("Generated image was not ingested from the active prompt version.");
  }

  const imageBytes = await fs.readFile(generated);
  const { errors, warnings } = validateForCanonicalLock(imageBytes, path.basename(generated));
  if (errors.length > 0) {
    throw new Error(`Canonical image rejected: ${errors.join("; ")}`);
  }

  const facePreflight = await preflightCanonicalImage(imageBytes, path.basename(generated), process.env.DIRECTORDESK_URL);
  if (facePreflight.errors.length > 0) {
    throw new Error(`Canonical image rejected: ${facePreflight.errors.join("; ")}`);
  }
  const approvalWarnings = [...warnings, ...facePreflight.warnings];

  const canonicalDir = path.join(root, "canonical");
  await fs.mkdir(canonicalDir, { recursive: true });
  const canonicalSha256 = crypto.createHash("sha256").update(imageBytes).digest("hex");
  const canonicalFilename = `canonical-${canonicalSha256.slice(0, 12)}${path.extname(generated)}`;
  const destination = path.join(canonicalDir, canonicalFilename);
  await writeImmutable(destination, imageBytes);

  const metrics = facePreflight.metrics;
  const metricValues = metrics
    ? ["det_score", "bbox_height_frac", "yaw_deg"]
        .filter((key) => metrics[key] !== undefined)
        .map((key) => `${key}=${String(metrics[key])}`)
    : [];
  const metricsSummary = metricValues.length > 0 ? ` (${metricValues.join(", ")})` : "";
  const provenance = `Approved in Identity Forge from prompt version ${activePromptVersion}; generated image ${path.basename(generated)}; face pre-flight ${facePreflight.status}${metricsSummary}`;
  await writeImmutable(
    `${destination}.canonical.json`,
    JSON.stringify(
      {
        schema_version: "canonical_image.v1",
        character_name: meta.name ?? id,
        version: canonicalSha256,
        created_by: { app: "identity-forge", version: packageJson.version },
        provenance,
        license: "TODO: usage rights not yet designated"
      },
      null,
      2
    )
  );
  await fs.writeFile(path.join(canonicalDir, "winning_prompt.md"), prompt);
  const { errors: _preflightErrors, ...facePreflightForApproval } = facePreflight;
  await fs.writeFile(
    path.join(canonicalDir, "approval.json"),
    JSON.stringify(
      {
        image: canonicalFilename,
        canonicalSha256,
        promptVersion: activePromptVersion,
        approvedAt: new Date().toISOString(),
        facePreflight: facePreflightForApproval,
        warnings: approvalWarnings
      },
      null,
      2
    )
  );
  await fs.writeFile(
    metaPath,
    JSON.stringify(
      {
        ...meta,
        canonicalPromptVersion: activePromptVersion,
        winningPrompt: prompt
      },
      null,
      2
    )
  );
  return { character: await getCharacter(id), warnings: approvalWarnings };
}

export async function writeCharacterImage(id: string, target: "references" | "generated", file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files can be imported.");
  }

  const extension = path.extname(file.name).toLowerCase() || `.${file.type.split("/")[1] ?? "png"}`;
  if (!IMAGE_EXTENSIONS.has(extension)) {
    throw new Error("Unsupported image format.");
  }

  const root = path.join(DATA_ROOT, id);
  const metaPath = path.join(root, "character.json");
  const meta = await readJson<CharacterMeta>(metaPath, {});
  const targetDir = path.join(root, target);
  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(path.join(targetDir, `${target === "references" ? "source" : "generated"}${extension}`), Buffer.from(await file.arrayBuffer()));

  const nextMeta = { ...meta, canonicalPromptVersion: null, winningPrompt: null };
  if (target === "references") {
    await fs.rm(path.join(root, "generated"), { recursive: true, force: true });
    nextMeta.generatedPromptVersion = null;
    nextMeta.generatedPrompt = null;
  } else {
    const prompt = meta.prompt ?? "";
    nextMeta.generatedPromptVersion = promptVersion(prompt);
    nextMeta.generatedPrompt = prompt;
  }
  await fs.rm(path.join(root, "canonical"), { recursive: true, force: true });
  await fs.writeFile(metaPath, JSON.stringify(nextMeta, null, 2));

  return getCharacter(id);
}

export async function promoteBatchCandidate(id: string, input: { batchOutputPath?: string; imagePath?: string; path?: string }) {
  const selectedPath = input.batchOutputPath ?? input.imagePath ?? input.path ?? "";
  if (!selectedPath.trim()) {
    throw new Error("Promote requires a batch output path.");
  }

  const sourceImage = resolveProjectFile(selectedPath);
  const extension = path.extname(sourceImage).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(extension)) {
    throw new Error("Unsupported batch output image format.");
  }
  if (!(await pathExists(sourceImage))) {
    throw new Error(`Batch output image not found: ${selectedPath}`);
  }

  const metadataPath = sourceImage.replace(/\.[^.]+$/, ".json");
  const promptPath = sourceImage.replace(/\.[^.]+$/, ".prompt.md");
  const metadata = await readJson<BatchCandidateMetadata>(metadataPath, {});
  const promptFromSidecar = await fs.readFile(promptPath, "utf8").catch(() => "");
  const prompt = (metadata.prompt ?? promptFromSidecar).trim();
  if (!prompt) {
    throw new Error("Batch output is missing prompt lineage metadata.");
  }

  const promptHash = metadata.promptVersion ?? promptVersion(prompt);
  const characterRoot = path.join(LOOP_CHARACTERS_ROOT, id);
  const promptsDir = path.join(characterRoot, "prompts");
  await fs.mkdir(promptsDir, { recursive: true });

  const batchName = safeName(metadata.batchId ?? "batch");
  const roundName = metadata.round ? `round_${String(metadata.round).padStart(2, "0")}` : safeName(path.basename(sourceImage, extension));
  const promotedPromptRelative = path.join("prompts", `promoted_${batchName}_${roundName}.md`);
  const promotedPromptPath = path.join(characterRoot, promotedPromptRelative);
  const generatedRelative = `generated${extension}`;
  const generatedPath = path.join(characterRoot, generatedRelative);
  const promotedMetadataRelative = "generated.json";
  const promotedMetadataPath = path.join(characterRoot, promotedMetadataRelative);
  const sourceRelative = path.relative(PROJECT_ROOT, sourceImage).split(path.sep).join("/");

  await fs.mkdir(characterRoot, { recursive: true });
  await fs.copyFile(sourceImage, generatedPath);
  await fs.writeFile(promotedPromptPath, prompt);
  await fs.writeFile(
    promotedMetadataPath,
    JSON.stringify(
      {
        state: "review",
        image: generatedRelative,
        prompt,
        promptVersion: promptHash,
        promptPath: promotedPromptRelative.split(path.sep).join("/"),
        promotedFrom: sourceRelative,
        batchMetadata: metadata,
        promotedAt: new Date().toISOString()
      },
      null,
      2
    )
  );

  return {
    characterId: id,
    status: "review",
    generatedImage: generatedRelative,
    promptPath: promotedPromptRelative.split(path.sep).join("/"),
    promptVersion: promptHash,
    metadataPath: promotedMetadataRelative,
    promotedFrom: sourceRelative,
    batchMetadata: metadata
  };
}

async function writeImageFile(file: File, destinationDir: string, basename: string) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files can be scheduled.");
  }

  const extension = path.extname(file.name).toLowerCase() || `.${file.type.split("/")[1] ?? "png"}`;
  if (!IMAGE_EXTENSIONS.has(extension)) {
    throw new Error("Unsupported image format.");
  }

  await fs.mkdir(destinationDir, { recursive: true });
  const destination = path.join(destinationDir, `${basename}${extension}`);
  await fs.writeFile(destination, Buffer.from(await file.arrayBuffer()));
  return destination;
}

export async function createBatchSchedule(
  id: string,
  input: {
    startAt: string;
    prompts: string[];
    references: [File, File];
  }
) {
  const cleanPrompts = input.prompts.map((prompt) => prompt.trim()).filter(Boolean);
  if (cleanPrompts.length === 0 || cleanPrompts.length > 6) {
    throw new Error("Schedule requires 1 to 6 prompts.");
  }

  const startAt = new Date(input.startAt);
  if (Number.isNaN(startAt.getTime())) {
    throw new Error("Schedule requires a valid start time.");
  }

  const batchId = `batch-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const root = path.join(DATA_ROOT, id);
  const batchRoot = path.join(root, "batches", batchId);
  const refsDir = path.join(batchRoot, "references");
  const generatedDir = path.join(batchRoot, "generated");
  const referencePaths = await Promise.all([
    writeImageFile(input.references[0], refsDir, "reference_01"),
    writeImageFile(input.references[1], refsDir, "reference_02")
  ]);

  await fs.mkdir(generatedDir, { recursive: true });
  const schedule: BatchSchedule = {
    id: batchId,
    characterId: id,
    status: "scheduled",
    startAt: startAt.toISOString(),
    intervalMinutes: 10,
    referenceImages: referencePaths.map((filePath) => path.relative(root, filePath)),
    rounds: cleanPrompts.map((prompt, index) => {
      const plannedAt = new Date(startAt.getTime() + index * 10 * 60 * 1000);
      return {
        round: index + 1,
        prompt,
        promptVersion: promptVersion(prompt),
        plannedAt: plannedAt.toISOString(),
        status: "scheduled",
        generatedImagePath: path.join("batches", batchId, "generated", `round_${String(index + 1).padStart(2, "0")}.png`)
      };
    }),
    createdAt: new Date().toISOString()
  };

  await fs.writeFile(path.join(batchRoot, "schedule.json"), JSON.stringify(schedule, null, 2));
  return schedule;
}

export function resolveDataFile(relativePath: string) {
  const safePath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const fullPath = path.join(DATA_ROOT, safePath);
  const relative = path.relative(DATA_ROOT, fullPath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Invalid file path.");
  }

  return fullPath;
}
