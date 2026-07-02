import { promises as fs } from "fs";
import path from "path";

export type CharacterRecord = {
  id: string;
  name: string;
  prompt: string;
  notes: string;
  referenceImage: string | null;
  generatedImage: string | null;
  approved: boolean;
};

type CharacterMeta = {
  name?: string;
  prompt?: string;
  notes?: string;
};

const DATA_ROOT = path.join(process.cwd(), "data", "characters");
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);
const DEFAULT_QUEUE = ["einstein", "tesla", "curie", "newton"];

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

function fileUrl(filePath: string | null) {
  if (!filePath) return null;
  const relative = path.relative(DATA_ROOT, filePath).split(path.sep).map(encodeURIComponent).join("/");
  return `/api/files?path=${relative}`;
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
        const canonical = await firstImage(path.join(root, "canonical"));

        return {
          id,
          name: meta.name ?? id.replaceAll("-", " ").replace(/\b\w/g, (match) => match.toUpperCase()),
          prompt: meta.prompt ?? "",
          notes: meta.notes ?? "",
          referenceImage: fileUrl(reference),
          generatedImage: fileUrl(generated),
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
  const generated = await firstImage(path.join(root, "generated"));
  if (!generated) {
    throw new Error("No generated image found.");
  }

  const canonicalDir = path.join(root, "canonical");
  await fs.mkdir(canonicalDir, { recursive: true });
  const destination = path.join(canonicalDir, `canonical${path.extname(generated)}`);
  await fs.copyFile(generated, destination);
  return getCharacter(id);
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
