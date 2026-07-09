type CanonicalImageFormat = "png" | "jpeg" | "webp";

export type CanonicalImageCheck = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  format?: CanonicalImageFormat;
  width?: number;
  height?: number;
  hasAlpha?: boolean;
};

type SharedCanonicalImageModule = {
  validateCanonicalImage(bytes: Buffer, filename: string): CanonicalImageCheck;
};

export type FacePreflightResult = {
  status: "checked" | "checked-format-only" | "skipped";
  baseUrl: string | null;
  checkedAt: string;
  metrics: Record<string, unknown> | null;
  reason?: string;
  errors: string[];
  warnings: string[];
};

type DirectorDeskPreflightModule = {
  preflightCanonicalImage(
    bytes: Buffer,
    filename: string,
    opts: { baseUrl: string | undefined; timeoutMs?: number; fetchImpl?: typeof fetch }
  ): Promise<FacePreflightResult>;
};

const sharedCanonicalImage = require("../scripts/shared-canonical-image.js") as SharedCanonicalImageModule;
const directorDeskPreflight = require("../scripts/dd-preflight.js") as DirectorDeskPreflightModule;

export function validateCanonicalImage(bytes: Buffer, filename: string): CanonicalImageCheck {
  return sharedCanonicalImage.validateCanonicalImage(bytes, filename);
}

export function validateForCanonicalLock(bytes: Buffer, filename: string) {
  const check = validateCanonicalImage(bytes, filename);
  const errors = [...check.errors];

  if (check.width !== undefined && check.height !== undefined && Math.min(check.width, check.height) < 1024) {
    errors.push(`canonical lock requires >=1024px short edge (got ${check.width}x${check.height})`);
  }

  return { errors, warnings: [...check.warnings] };
}

export function preflightCanonicalImage(bytes: Buffer, filename: string, baseUrl: string | undefined) {
  return directorDeskPreflight.preflightCanonicalImage(bytes, filename, { baseUrl });
}
