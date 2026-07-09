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

const sharedCanonicalImage = require("../scripts/shared-canonical-image.js") as SharedCanonicalImageModule;

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
