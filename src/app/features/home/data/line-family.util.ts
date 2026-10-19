import type { LinePulse } from "./home-board.queries";

/**
 * The operator / line-family axis the board can be filtered by.
 *
 * The front-page `Line` read carries NO operator field (the Strawberry `Line` type exposes code,
 * display name, colour, status and vehicle counts only), so a family is derived from the line code:
 * its leading run of letters, upper-cased. `KTM1` → `KTM`, `KJL` → `KJL`, `k10` → `K`. A code with no
 * letters at all (`1`) falls into {@link OTHER_LINE_FAMILY}.
 *
 * 🔴 The chips show the prefixes the data actually carries. Nothing maps a prefix to a company or a
 * transit mode, because that mapping is not in the data and inventing one would label lines wrongly.
 */
export const OTHER_LINE_FAMILY = "OTHER";

/** The URL param. Named once so the board's read and any link that builds it cannot drift. */
export const LINE_FAMILY_PARAM = "op";

/** A family is 1–16 letters. Anything else in `?op=` is not a family and degrades to "All". */
const FAMILY_PATTERN = /^[A-Z]{1,16}$/;

export function lineFamily(code: string): string {
  const leading = /^[A-Za-z]+/.exec(code.trim());
  return leading ? leading[0].toUpperCase() : OTHER_LINE_FAMILY;
}

/** The distinct families present in these lines, A to Z, with {@link OTHER_LINE_FAMILY} last. */
export function lineFamilies(lines: readonly LinePulse[]): string[] {
  const families = [...new Set(lines.map((line) => lineFamily(line.code)))];
  return families.sort((a, b) => {
    if (a === b) {
      return 0;
    }
    if (a === OTHER_LINE_FAMILY) {
      return 1;
    }
    if (b === OTHER_LINE_FAMILY) {
      return -1;
    }
    return a.localeCompare(b);
  });
}

/** The lines in one family, in input order, or every line when `family` is `null`. */
export function filterByLineFamily(
  lines: readonly LinePulse[],
  family: string | null,
): LinePulse[] {
  if (family === null) {
    return [...lines];
  }
  return lines.filter((line) => lineFamily(line.code) === family);
}

/**
 * The URL's family, normalised to upper case, or `null` when absent or not shaped like a family.
 * Whether a well-formed family exists in the data is the board's question, not this parse's.
 */
export function parseLineFamilyParam(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim().toUpperCase();
  return FAMILY_PATTERN.test(text) ? text : null;
}
