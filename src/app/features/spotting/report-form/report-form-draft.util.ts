import type { SpottingType, SpottingVehicleStatus, WheelStatus } from "../../../core/graphql/types";
import { SESSION_DRAFT_PREFIX } from "../../../core/util/web-storage.util";
import { emptyReportFormModel, type ReportFormModel } from "./report-form.schema";

/**
 * `sessionStorage` key of the spotting report draft. ONE slot: the form picks its own line and
 * vehicle, so the draft carries them in its payload, and a line-seeded open restores it only for
 * that line (see `ReportFormComponent`). The `:v1` suffix is the shape version, as for
 * `rosak:preferences:v1`: a shape change bumps it and orphans the old payload. Under
 * `SESSION_DRAFT_PREFIX`, so it is removed when the signed-in account changes.
 */
export const REPORT_FORM_DRAFT_KEY = `${SESSION_DRAFT_PREFIX}spotting-report:v1`;

/**
 * A saved draft: the model without its derived `selectedVehicleStatus` (the form re-derives it from
 * the vehicle list), and how many photos it had. File blobs are not saved, so the rider picks the
 * photos again; the count lets the "Draft restored" line say so.
 */
export interface ReportFormDraft {
  model: ReportFormModel;
  photoCount: number;
}

/** The free-text and id fields a draft keeps. One list, so the writer, reader and comparison agree. */
const TEXT_FIELDS = [
  "lineId",
  "vehicleId",
  "atStation",
  "originStation",
  "destinationStation",
  "runNumber",
  "notes",
] as const;

const FLAG_FIELDS = ["isAnonymous", "sanityTest"] as const;

/** The `<select>` options the form offers, so a stored value outside them falls back. */
const SPOTTING_TYPES: readonly SpottingType[] = [
  "JUST_SPOTTING",
  "DEPOT",
  "LOCATION",
  "AT_STATION",
  "BETWEEN_STATIONS",
];
const VEHICLE_STATUSES: readonly SpottingVehicleStatus[] = [
  "IN_SERVICE",
  "NOT_IN_SERVICE",
  "DECOMMISSIONED",
  "TESTING",
];
const WHEEL_STATUSES: readonly WheelStatus[] = [
  "FRESH",
  "NEAR_PERFECT",
  "FLAT",
  "WORN_OUT",
  "WORRYING",
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

/** True when the two models hold the same draft. `selectedVehicleStatus` is derived, so ignored. */
export function sameReportFormDraft(a: ReportFormModel, b: ReportFormModel): boolean {
  return (
    TEXT_FIELDS.every((field) => a[field] === b[field]) &&
    FLAG_FIELDS.every((field) => a[field] === b[field]) &&
    a.spottingDate === b.spottingDate &&
    a.status === b.status &&
    a.type === b.type &&
    a.wheelStatus === b.wheelStatus
  );
}

export function serializeReportFormDraft(model: ReportFormModel, photoCount: number): string {
  const saved: Record<string, string | boolean | number> = {
    spottingDate: model.spottingDate,
    status: model.status,
    type: model.type,
    wheelStatus: model.wheelStatus,
    photoCount,
  };
  for (const field of TEXT_FIELDS) {
    saved[field] = model[field];
  }
  for (const field of FLAG_FIELDS) {
    saved[field] = model[field];
  }
  return JSON.stringify(saved);
}

/**
 * The stored draft, or `null` when there is nothing to restore: no value, a value that is not a
 * JSON object, or one that reads back as an empty form. Never throws. Each field is checked on its
 * own and falls back to the empty form's value, the rule `parseStoredPreferences` follows, so one
 * unreadable field does not cost the rider the rest of the draft.
 */
export function parseReportFormDraft(raw: string | null | undefined): ReportFormDraft | null {
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
  const empty = emptyReportFormModel();
  const model = emptyReportFormModel();
  for (const field of TEXT_FIELDS) {
    const value = parsed[field];
    if (typeof value === "string") {
      model[field] = value;
    }
  }
  for (const field of FLAG_FIELDS) {
    const value = parsed[field];
    if (typeof value === "boolean") {
      model[field] = value;
    }
  }
  const date = parsed["spottingDate"];
  if (typeof date === "string" && ISO_DATE.test(date)) {
    model.spottingDate = date;
  }
  model.status = oneOf(parsed["status"], VEHICLE_STATUSES) ?? empty.status;
  model.type = oneOf(parsed["type"], SPOTTING_TYPES) ?? empty.type;
  model.wheelStatus = oneOf(parsed["wheelStatus"], WHEEL_STATUSES) ?? "";
  const count = parsed["photoCount"];
  const photoCount = typeof count === "number" && Number.isInteger(count) && count > 0 ? count : 0;

  if (photoCount === 0 && sameReportFormDraft(model, empty)) {
    return null;
  }
  return { model, photoCount };
}
