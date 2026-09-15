import type { ExtractedIncidentData } from "../data/incident-ai.service";
import type { ChronologyDraft } from "./chronology-list.util";

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
