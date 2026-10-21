import type { ExtractedIncidentData } from "../data/incident-ai.service";
import {
  emptyChronology,
  type ChronologyDraft,
  type ChronologyIndicator,
} from "./chronology-list.util";

/** Converts an ISO 8601 datetime to the `YYYY-MM-DDTHH:MM` value a
 * datetime-local input expects, in the user's local timezone. Empty string
 * for null/invalid input, so callers can keep their existing value. */
export function isoToDateTimeLocal(iso: string | null | undefined): string {
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** Projects extracted incident data onto a chronology draft. Only the fields
 * the extraction is authoritative for are overwritten; the user's own source
 * URL and indicator choice are preserved. */
export function applyExtractionToChronology(
  draft: ChronologyDraft,
  data: ExtractedIncidentData,
): ChronologyDraft {
  return {
    ...draft,
    datetime: isoToDateTimeLocal(data.datetime) || draft.datetime,
    content: data.content ?? draft.content,
  };
}

// ---------------------------------------------------------------------------
// Mapping layer: what the incident form can take from an extraction.
//
// The extraction speaks the model's vocabulary (indicator delay|disruption..., severity
// minor|moderate..., line and station names as written in the article); the form speaks its own
// enums and reference ids. Everything below translates and decides, and nothing touches Angular,
// so each rule is unit-tested in extract-data.util.spec.ts. The incident form applies the result
// to fields that are still empty and never overwrites what the rider typed.
// ---------------------------------------------------------------------------

/** Trimmed, with inner whitespace collapsed: the reference data has names such as
 * "LRT Ampang  Line" (two spaces). */
function tidy(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** Case, edge and inner-whitespace insensitive comparison key; a model may capitalise however it
 * likes. */
function nameKey(value: string | null | undefined): string {
  return tidy(value ?? "").toLowerCase();
}

// A Map, not an object literal: an object would answer "constructor" for a model that says so.
const INDICATOR_BY_KIND = new Map<string, ChronologyIndicator>([
  ["delay", "RED"],
  ["disruption", "RED"],
  ["accident", "RED"],
  ["maintenance", "BLUE"],
  ["other", "GRAY"],
]);

/** The form's chronology colour for an extraction `indicator`: a problem under way is RED, a
 * planned-works notice is BLUE (informational), "other" is GRAY. GREEN means "resolved" and is never
 * proposed, because the kind of incident says nothing about whether it is over. `null` for a word
 * outside the vocabulary, so the caller keeps its own value. */
export function mapExtractedIndicator(kind: string | null | undefined): ChronologyIndicator | null {
  return INDICATOR_BY_KIND.get(nameKey(kind)) ?? null;
}

type ProposedSeverity = "MAJOR" | "MINOR";

// The backend defines MAJOR as an entire or part of a line being broken (or a crash) and MINOR as
// single-vehicle disruptions, so the in-between "moderate" takes the safe side: a rider can raise
// it, but an over-alarming MAJOR dot on the calendar is the worse mistake.
const SEVERITY_BY_WORD = new Map<string, ProposedSeverity>([
  ["critical", "MAJOR"],
  ["severe", "MAJOR"],
  ["major", "MAJOR"],
  ["moderate", "MINOR"],
  ["minor", "MINOR"],
]);

/** The form's severity for an extraction `severity`. `OTHERS` is never proposed; `null` for an
 * absent or unknown word. */
export function mapExtractedSeverity(severity: string | null | undefined): ProposedSeverity | null {
  return SEVERITY_BY_WORD.get(nameKey(severity)) ?? null;
}

/** An extraction may only carry a time inside this window. `notBefore` is the start of the incident
 * date the form shows (see `incidentDayStart`); `null` while there is no such date. */
export interface DatetimeWindow {
  now: Date;
  notBefore: Date | null;
}

const ONE_DAY_MS = 86_400_000;

/** The extracted ISO datetime when it is plausible, else `null` (treated as absent). The model has
 * to guess a year or resolve "yesterday", so a time more than a day after `now` or before
 * `notBefore` is a wrong guess, not an observation. Bounds are inclusive. */
export function plausibleDatetime(
  iso: string | null | undefined,
  window: DatetimeWindow,
): string | null {
  if (!iso) {
    return null;
  }
  const at = new Date(iso).getTime();
  if (Number.isNaN(at) || at > window.now.getTime() + ONE_DAY_MS) {
    return null;
  }
  if (window.notBefore && at < window.notBefore.getTime()) {
    return null;
  }
  return iso;
}

/** Local midnight at the start of the date in a `datetime-local` value (the form's Start field);
 * `null` for an empty or malformed value. */
export function incidentDayStart(startDatetime: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(startDatetime)) {
    return null;
  }
  const start = new Date(`${startDatetime.slice(0, 10)}T00:00`);
  return Number.isNaN(start.getTime()) ? null : start;
}

/** A line or station the form already loaded, as the matcher needs it. */
export interface ReferenceMatchOption {
  id: string;
  /** Short text for the chip: a line's code, a station's display name. */
  label: string;
  /** Every spelling that identifies the option: a line's code and display name. */
  names: readonly string[];
}

export interface ReferenceMatches {
  matched: ReferenceMatchOption[];
  /** Extracted names no option answers to, in the model's own spelling (trimmed, deduplicated). */
  unmatched: string[];
}

/** Matches extracted names to options by exact, case-insensitive name. Deliberately not fuzzy: a
 * wrong line or station tagged on a public incident is worse than one the rider adds by hand, and
 * every name left over is returned in `unmatched` so none is silently lost.
 * shortcut: the first option wins when two share a name; the reference data has no such pair
 * today, so revisit only if a duplicate ever appears. */
export function matchReferenceNames(
  names: readonly unknown[] | null | undefined,
  options: readonly ReferenceMatchOption[],
): ReferenceMatches {
  const optionByName = new Map<string, ReferenceMatchOption>();
  for (const option of options) {
    for (const name of option.names) {
      const key = nameKey(name);
      if (key && !optionByName.has(key)) {
        optionByName.set(key, option);
      }
    }
  }
  const matched = new Map<string, ReferenceMatchOption>();
  const unmatched = new Map<string, string>();
  // Untrusted network JSON: tolerate a missing or non-array field and non-string entries.
  const list: readonly unknown[] = Array.isArray(names) ? names : [];
  for (const name of list) {
    if (typeof name !== "string") {
      continue;
    }
    const key = nameKey(name);
    if (!key) {
      continue;
    }
    const option = optionByName.get(key);
    if (option) {
      matched.set(option.id, option);
    } else if (!unmatched.has(key)) {
      unmatched.set(key, tidy(name));
    }
  }
  return { matched: [...matched.values()], unmatched: [...unmatched.values()] };
}

/** What the form holds, right now, in the fields an extraction may fill. */
export interface FormFillCurrent {
  title: string;
  /** `""` while no severity is chosen. */
  severity: string;
  lineIds: readonly string[];
  stationIds: readonly string[];
}

/** The lines and stations the form has loaded. */
export interface FormFillReference {
  lines: readonly ReferenceMatchOption[];
  stations: readonly ReferenceMatchOption[];
}

/** The proposals for the form's own fields; each is empty when its field is already filled. */
export interface FormFill {
  title: string | null;
  severity: ProposedSeverity | null;
  lines: ReferenceMatches;
  stations: ReferenceMatches;
}

function noMatches(): ReferenceMatches {
  return { matched: [], unmatched: [] };
}

/** Decides what an extraction may put into the form's title, severity, lines and stations. A field
 * that already holds something is left alone (the proposal for it is empty), so a rider's own
 * input is never overwritten. `reference` is `null` while lines and stations have not loaded;
 * their names are then neither matched nor reported as unmatched, since nothing was compared. */
export function planFormFill(
  current: FormFillCurrent,
  data: ExtractedIncidentData,
  reference: FormFillReference | null,
): FormFill {
  const title = typeof data.title === "string" ? tidy(data.title) : "";
  return {
    title: title && !current.title.trim() ? title : null,
    severity: current.severity ? null : mapExtractedSeverity(data.severity),
    lines:
      reference && current.lineIds.length === 0
        ? matchReferenceNames(data.affected_lines, reference.lines)
        : noMatches(),
    stations:
      reference && current.stationIds.length === 0
        ? matchReferenceNames(data.affected_stations, reference.stations)
        : noMatches(),
  };
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** What a fill put into the form, for the confirmation toast ("title, severity, 2 lines");
 * `""` when it filled nothing. */
export function describeFormFill(fill: FormFill): string {
  return [
    fill.title !== null ? "title" : "",
    fill.severity !== null ? "severity" : "",
    fill.lines.matched.length > 0 ? plural(fill.lines.matched.length, "line") : "",
    fill.stations.matched.length > 0 ? plural(fill.stations.matched.length, "station") : "",
  ]
    .filter(Boolean)
    .join(", ");
}

/** The indicator a chronology row ends up with after an extraction. The indicator select has no
 * empty option, so "still empty" means a blank row left on the default colour: no time, no text,
 * as when a rider has just added the row and pasted a link. Any other row carries a choice (or a
 * hydrated entry) and keeps it. */
export function proposeIndicator(
  draft: ChronologyDraft,
  data: Pick<ExtractedIncidentData, "indicator">,
): ChronologyIndicator {
  const untouched =
    !draft.datetime && !draft.content && draft.indicator === emptyChronology(draft.key).indicator;
  return (untouched ? mapExtractedIndicator(data.indicator) : null) ?? draft.indicator;
}
