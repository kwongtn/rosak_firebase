import { describe, expect, it } from "vitest";

import {
  parseReportFormDraft,
  sameReportFormDraft,
  serializeReportFormDraft,
} from "./report-form-draft.util";
import { emptyReportFormModel, type ReportFormModel } from "./report-form.schema";

function filledModel(): ReportFormModel {
  return {
    ...emptyReportFormModel(),
    lineId: "4",
    vehicleId: "v1",
    selectedVehicleStatus: "OUT_OF_SERVICE",
    spottingDate: "2026-10-20",
    status: "NOT_IN_SERVICE",
    type: "BETWEEN_STATIONS",
    originStation: "s1",
    destinationStation: "s2",
    wheelStatus: "FLAT",
    runNumber: "12",
    notes: "Screeching on the curve",
    isAnonymous: true,
    sanityTest: true,
  };
}

describe("report form draft (de)serialisers", () => {
  it("round-trips every field a rider types, and the photo count", () => {
    const model = filledModel();

    const draft = parseReportFormDraft(serializeReportFormDraft(model, 2));

    expect(draft?.photoCount).toBe(2);
    expect(draft?.model).toEqual({ ...model, selectedVehicleStatus: "" });
  });

  it("does not save the derived vehicle status", () => {
    const raw = serializeReportFormDraft(filledModel(), 0);

    expect(JSON.parse(raw)).not.toHaveProperty("selectedVehicleStatus");
  });

  it.each([
    ["nothing stored", null],
    ["an empty string", ""],
    ["text that is not JSON", "{not json"],
    ["a JSON array", "[1,2]"],
    ["a JSON string", '"draft"'],
    ["JSON null", "null"],
    ["an empty object", "{}"],
  ])("returns null, without throwing, for %s", (_label, raw) => {
    expect(parseReportFormDraft(raw)).toBeNull();
  });

  it("returns null for a stored form that is still the empty form", () => {
    expect(parseReportFormDraft(serializeReportFormDraft(emptyReportFormModel(), 0))).toBeNull();
  });

  it("keeps an otherwise empty draft that had photos, so the rider is told to add them again", () => {
    expect(
      parseReportFormDraft(serializeReportFormDraft(emptyReportFormModel(), 1))?.photoCount,
    ).toBe(1);
  });

  it("falls back field by field, keeping what it can read", () => {
    const draft = parseReportFormDraft(
      JSON.stringify({
        lineId: "4",
        notes: 42,
        isAnonymous: "yes",
        spottingDate: "yesterday",
        status: "FLYING",
        type: "TELEPORT",
        wheelStatus: "SQUARE",
        photoCount: -3,
      }),
    );
    const empty = emptyReportFormModel();

    expect(draft?.model.lineId).toBe("4");
    expect(draft?.model.notes).toBe("");
    expect(draft?.model.isAnonymous).toBe(false);
    expect(draft?.model.spottingDate).toBe(empty.spottingDate);
    expect(draft?.model.status).toBe(empty.status);
    expect(draft?.model.type).toBe(empty.type);
    expect(draft?.model.wheelStatus).toBe("");
    expect(draft?.photoCount).toBe(0);
  });

  it("compares drafts on what they keep, ignoring the derived vehicle status", () => {
    const a = filledModel();

    expect(sameReportFormDraft(a, { ...a, selectedVehicleStatus: "" })).toBe(true);
    expect(sameReportFormDraft(a, { ...a, notes: "different" })).toBe(false);
    expect(sameReportFormDraft(a, { ...a, sanityTest: false })).toBe(false);
    expect(sameReportFormDraft(a, { ...a, type: "DEPOT" })).toBe(false);
  });
});
