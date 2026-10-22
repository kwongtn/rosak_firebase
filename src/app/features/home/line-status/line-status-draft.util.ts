import { PASSENGER_STATUSES } from "../data/board-lines.util";
import type { PassengerStatus } from "../data/home.queries";

/**
 * `sessionStorage` key of one line's line-status draft. One draft per line: the sheet always opens
 * for a line, so the line is the key, and a draft for one line never shows up on another's sheet.
 * The `:v1` segment is the shape version (a shape change bumps it and orphans the old payload).
 */
export function lineStatusDraftKey(lineId: string): string {
  return `rosak:line-status-draft:v1:${lineId}`;
}

/** Everything the sheet holds that a rider types or picks. */
export interface LineStatusDraft {
  status: PassengerStatus | null;
  /** The field's raw text, parsed only on submit, exactly like the sheet's own signal. */
  delayMinutes: string;
  notes: string;
  stationIds: string[];
}

export function blankLineStatusDraft(): LineStatusDraft {
  return { status: null, delayMinutes: "", notes: "", stationIds: [] };
}

/** True when nothing is picked or typed: such a draft is never saved, and reads back as `null`. */
export function isBlankLineStatusDraft(draft: LineStatusDraft): boolean {
  return (
    draft.status === null &&
    draft.delayMinutes === "" &&
    draft.notes === "" &&
    draft.stationIds.length === 0
  );
}

export function sameLineStatusDraft(a: LineStatusDraft, b: LineStatusDraft): boolean {
  return (
    a.status === b.status &&
    a.delayMinutes === b.delayMinutes &&
    a.notes === b.notes &&
    a.stationIds.length === b.stationIds.length &&
    a.stationIds.every((id, index) => id === b.stationIds[index])
  );
}

export function serializeLineStatusDraft(draft: LineStatusDraft): string {
  return JSON.stringify(draft);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The stored draft, or `null` when there is nothing to restore: no value, a value that is not a
 * JSON object, or one that reads back blank. Never throws. Fields are checked one by one and fall
 * back to blank, so an unreadable field does not cost the rest of the draft.
 */
export function parseLineStatusDraft(raw: string | null | undefined): LineStatusDraft | null {
  if (typeof raw !== "string" || raw === "") {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) {
    return null;
  }
  const status = parsed["status"];
  const delayMinutes = parsed["delayMinutes"];
  const notes = parsed["notes"];
  const stationIds = parsed["stationIds"];
  const draft: LineStatusDraft = {
    status:
      typeof status === "string" && (PASSENGER_STATUSES as readonly string[]).includes(status)
        ? (status as PassengerStatus)
        : null,
    delayMinutes: typeof delayMinutes === "string" ? delayMinutes : "",
    notes: typeof notes === "string" ? notes : "",
    stationIds: Array.isArray(stationIds)
      ? stationIds.filter((id): id is string => typeof id === "string" && id !== "")
      : [],
  };
  return isBlankLineStatusDraft(draft) ? null : draft;
}
