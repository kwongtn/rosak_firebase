import { describe, expect, it } from "vitest";

import type { CalendarIncident } from "../data/insiden.queries";
import { emptyChronology } from "./chronology-list.util";
import { isoToDateTimeLocal } from "./extract-data.util";
import { incidentToForm } from "./incident-to-form.util";

/** Complete incident fixture — `categories` and `version` are optional on the interface, so
 * overrides can exercise the null-ish cases. */
function incident(overrides: Partial<CalendarIncident> = {}): CalendarIncident {
  return {
    id: "7",
    startDatetime: "2026-08-22T09:30:00Z",
    endDatetime: "2026-08-22T11:00:00Z",
    severity: "MAJOR",
    title: "KL Sentral flood",
    brief: "Platform 3 underwater",
    details: "Water over the platforms.",
    hasDetails: true,
    impactFactor: 1,
    longTerm: false,
    inaccurate: true,
    lastUpdated: "2026-08-22T10:00:00Z",
    lines: [{ id: "L1", code: "KJL", displayName: "Kelana Jaya Line" }],
    vehicles: [{ id: "V1", identificationNo: "C243" }],
    stations: [{ id: "S1", displayName: "KL Sentral" }],
    chronologies: [
      {
        order: 2,
        indicator: "RED",
        datetime: "2026-08-22T10:30:00Z",
        content: "Clearing",
        sourceUrl: null,
      },
      {
        order: 1,
        indicator: "GREEN",
        datetime: "2026-08-22T09:30:00Z",
        content: "Started",
        sourceUrl: "https://x.com/a/1",
      },
    ],
    voteScore: 0,
    voteBreakdown: { upvotes: 0, downvotes: 0 },
    userVote: 0,
    medias: [],
    ...overrides,
  } as CalendarIncident;
}

describe("incidentToForm", () => {
  it("maps the flat model fields and the affected-asset id arrays", () => {
    const result = incidentToForm(
      incident({
        categories: [{ id: "C1", name: "Just Reporting" }],
      }),
    );

    expect(result.model).toEqual({
      title: "KL Sentral flood",
      brief: "Platform 3 underwater",
      details: "Water over the platforms.",
      startDatetime: isoToDateTimeLocal("2026-08-22T09:30:00Z"),
      endDatetime: isoToDateTimeLocal("2026-08-22T11:00:00Z"),
      severity: "MAJOR",
      longTerm: false,
      inaccurate: true,
    });
    expect(result.selectedLineIds).toEqual(["L1"]);
    expect(result.selectedVehicleIds).toEqual(["V1"]);
    expect(result.selectedStationIds).toEqual(["S1"]);
    expect(result.selectedCategoryIds).toEqual(["C1"]);
  });

  it("sorts chronologies by their backend order", () => {
    const result = incidentToForm(incident());
    expect(result.chronologies.map((c) => c.content)).toEqual(["Started", "Clearing"]);
  });

  it("keys chronologies from startKey sequentially and keeps them collapsed", () => {
    const result = incidentToForm(incident(), 5);
    expect(result.chronologies.map((c) => c.key)).toEqual([5, 6]);
    expect(result.chronologies.every((c) => c.collapsed === false)).toBe(true);
  });

  it("converts chronology datetimes for datetime-local inputs and nulls source URLs to empty strings", () => {
    const result = incidentToForm(incident());
    expect(result.chronologies[0]!.datetime).toBe(isoToDateTimeLocal("2026-08-22T09:30:00Z"));
    expect(result.chronologies[0]!.sourceUrl).toBe("https://x.com/a/1");
    expect(result.chronologies[1]!.sourceUrl).toBe("");
  });

  it("tolerates empty/null-ish fields", () => {
    const result = incidentToForm(
      incident({
        endDatetime: null,
        details: "",
        longTerm: false,
        inaccurate: false,
        chronologies: [],
        lines: [],
        vehicles: [],
        stations: [],
        categories: [],
      }),
    );

    expect(result.model.endDatetime).toBe("");
    expect(result.model.details).toBe("");
    expect(result.model.longTerm).toBe(false);
    expect(result.model.inaccurate).toBe(false);
    expect(result.chronologies).toEqual([]);
    expect(result.selectedLineIds).toEqual([]);
    expect(result.selectedVehicleIds).toEqual([]);
    expect(result.selectedStationIds).toEqual([]);
    expect(result.selectedCategoryIds).toEqual([]);
  });

  it("falls back to empty strings and arrays for missing optional data (no categories fetched)", () => {
    const result = incidentToForm(incident({ categories: undefined }));

    expect(result.selectedCategoryIds).toEqual([]);
    expect(result.selectedLineIds).toEqual(["L1"]);
  });

  it("maps a single omitted datetime to an empty string without throwing", () => {
    const result = incidentToForm(incident({ endDatetime: null }));
    expect(result.model.endDatetime).toBe("");
    expect(result.model.startDatetime).not.toBe("");
  });

  it("is a pure projection — the source incident is untouched", () => {
    const source = incident();
    const beforeOrder = source.chronologies.map((c) => c.order);
    incidentToForm(source, 3);
    expect(source.chronologies.map((c) => c.order)).toEqual(beforeOrder);
    expect(source.title).toBe("KL Sentral flood");
  });
});

describe("incidentToForm draft shape", () => {
  it("produces drafts shaped like the rest of the chronology editor", () => {
    const [draft] = incidentToForm(incident(), 2).chronologies;
    expect(typeof draft?.key).toBe("number");
    expect(draft?.indicator).toBe("GREEN");
    expect("datetime" in (draft ?? emptyChronology(0))).toBe(true);
    expect(typeof draft?.content).toBe("string");
    expect(draft?.collapsed).toBe(false);
  });
});
