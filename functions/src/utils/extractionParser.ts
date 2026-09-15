/**
 * Boundary parsing for Gemini extraction replies.
 *
 * The LLM's JSON output is untrusted input: it is parsed and coerced into a
 * typed ExtractedIncident exactly once, here. Everything downstream receives
 * typed values only.
 */

export const INDICATORS = ["delay", "disruption", "accident", "maintenance", "other"] as const;
export const SEVERITIES = ["minor", "moderate", "major", "critical"] as const;

export interface ExtractedIncident {
  title: string | null;
  datetime: string | null;
  content: string | null;
  source_url: string;
  indicator: (typeof INDICATORS)[number];
  severity: (typeof SEVERITIES)[number] | null;
  affected_lines: string[];
  affected_stations: string[];
}

export function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/** Keeps only known enum values; unknown model output falls back instead of failing the request. */
function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.find((option) => option === value) ?? fallback;
}

function pickEnumOrNull<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return allowed.find((option) => option === value) ?? null;
}

/**
 * Parses Gemini's raw JSON reply into a typed ExtractedIncident.
 * Throws an Error subclass carrying `code` when the reply is not usable JSON
 * of object shape; enum drift and missing fields are normalized, not rejected.
 */
export function parseExtraction(raw: string, url: string): ExtractedIncident {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ExtractionParseError("AI extraction returned invalid JSON");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ExtractionParseError("AI extraction returned an unexpected shape");
  }

  // Copy into a string-keyed record so fields can be read without casting.
  const record: Record<string, unknown> = {};
  Object.assign(record, parsed);

  return {
    title: asStringOrNull(record["title"]),
    datetime: asStringOrNull(record["datetime"]),
    content: asStringOrNull(record["content"]),
    source_url: asStringOrNull(record["source_url"]) ?? url,
    indicator: pickEnum(record["indicator"], INDICATORS, "other"),
    severity: pickEnumOrNull(record["severity"], SEVERITIES),
    affected_lines: asStringArray(record["affected_lines"]),
    affected_stations: asStringArray(record["affected_stations"]),
  };
}

/** Typed error so the callable layer can map this to an internal HttpsError. */
export class ExtractionParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionParseError";
  }
}
