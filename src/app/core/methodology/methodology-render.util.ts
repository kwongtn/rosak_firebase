import {
  METRIC_DOCS,
  METHODOLOGY_SECTIONS,
  type MethodologySection,
  type MetricDoc,
} from "./methodology.content";
import { METHODOLOGY_CONSTANTS } from "./methodology.constants";

/** Matches `{{TOKEN}}`; every match must resolve to a constant or throw — none survives render. */
const TOKEN_PATTERN = /\{\{([^{}]+)\}\}/g;

/**
 * The constants flattened to `token → bare value` for interpolation. Computed from
 * `METHODOLOGY_CONSTANTS` on each call so a test (or a future CMS overlay) that mutates a
 * constant is reflected immediately rather than frozen at module load.
 */
export function methodologyTokenValues(): Record<string, number | string> {
  return Object.fromEntries(
    Object.entries(METHODOLOGY_CONSTANTS).map(([token, constant]) => [token, constant.value]),
  );
}

/**
 * Interpolate every `{{TOKEN}}` in `text` from `values` (the registry constants by default).
 * An unknown token throws — the global ErrorHandler is Sentry-backed, and a raw `{{TOKEN}}`
 * must never reach a rider.
 */
export function renderMethodologyCopy(
  text: string,
  values: Record<string, number | string> = methodologyTokenValues(),
): string {
  return text.replace(TOKEN_PATTERN, (_match, token: string) => {
    const value = values[token];
    if (value === undefined) {
      throw new Error(`Unknown methodology token: {{${token}}}`);
    }
    return String(value);
  });
}

/** The metric doc with this id; throws on an unknown id so a typo fails loudly. */
export function metricDoc(id: string): MetricDoc {
  const doc = METRIC_DOCS.find((entry) => entry.id === id);
  if (!doc) {
    throw new Error(`Unknown methodology metric: ${id}`);
  }
  return doc;
}

/** The section with this id; throws on an unknown id so a typo fails loudly. */
export function section(id: string): MethodologySection {
  const found = METHODOLOGY_SECTIONS.find((entry) => entry.id === id);
  if (!found) {
    throw new Error(`Unknown methodology section: ${id}`);
  }
  return found;
}
