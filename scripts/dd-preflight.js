const DEFAULT_TIMEOUT_MS = 60000;

function skippedResult(baseUrl, checkedAt, reason) {
  return {
    status: "skipped",
    baseUrl: baseUrl ?? null,
    checkedAt,
    metrics: null,
    reason,
    errors: [],
    warnings: [`face pre-flight skipped: ${reason}`]
  };
}

async function preflightCanonicalImage(bytes, filename, opts = {}) {
  const { baseUrl, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = globalThis.fetch } = opts;
  const checkedAt = new Date().toISOString();

  if (!baseUrl) {
    return skippedResult(baseUrl, checkedAt, "DIRECTORDESK_URL not set");
  }

  if (typeof fetchImpl !== "function") {
    return skippedResult(baseUrl, checkedAt, "fetch is not available");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;

  try {
    const form = new FormData();
    form.append("files", new Blob([bytes]), filename);
    response = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}/api/canonical-image/validate`, {
      method: "POST",
      body: form,
      signal: controller.signal
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const reason = controller.signal.aborted ? `request timed out after ${timeoutMs}ms` : `request failed: ${detail}`;
    return skippedResult(baseUrl, checkedAt, reason);
  } finally {
    clearTimeout(timeout);
  }

  if (response.status !== 200) {
    return skippedResult(baseUrl, checkedAt, `Director Desk returned HTTP ${response.status}`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return skippedResult(baseUrl, checkedAt, `Director Desk returned an unparseable response: ${detail}`);
  }

  if (!payload || !Array.isArray(payload.results) || payload.results.length === 0) {
    return skippedResult(baseUrl, checkedAt, "Director Desk returned no results");
  }

  const result = payload.results[0] || {};
  const face = result.face && typeof result.face === "object" ? result.face : null;
  const errors = Array.isArray(result.errors)
    ? result.errors.map((error) => `face pre-flight (Director Desk): ${String(error)}`)
    : [];
  const warnings = Array.isArray(result.warnings)
    ? result.warnings.map((warning) => `face pre-flight (Director Desk): ${String(warning)}`)
    : [];
  let status = "checked";

  if (face && face.available === false) {
    const reason = face.reason ? String(face.reason) : "reason not provided";
    status = "checked-format-only";
    warnings.push(`face pre-flight: face check unavailable (${reason})`);
  } else {
    const count = face ? face.count : undefined;
    if (count !== 1) {
      errors.push(`face pre-flight found ${count} faces (exactly 1 required)`);
    } else if (face.pass === false && Array.isArray(face.issues)) {
      for (const issue of face.issues) warnings.push(`face pre-flight: ${String(issue)}`);
    }
  }

  return {
    status,
    baseUrl,
    checkedAt,
    metrics: face,
    errors,
    warnings
  };
}

module.exports = { preflightCanonicalImage };
