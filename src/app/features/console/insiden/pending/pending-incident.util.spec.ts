import { describe, expect, it } from "vitest";

import type { IncidentFormModel } from "../../../insiden/incident-form/incident-form.schema";
import type { PendingIncident } from "../data/insiden-console.queries";
import {
  asCalendarIncident,
  buildUpdatedIncidentRow,
  isIncidentFormSaveable,
  severityBadgeVariant,
  severityLabelText,
  type ChronologyExtractState,
} from "./pending-incident.util";

function makeRow(overrides: Partial<PendingIncident> = {}): PendingIncident {
  return {
    id: "inc-1",
    title: "LRT line down",
    brief: "Service suspended",
    details: "",
    severity: "MAJOR",
    startDatetime: "2026-08-01T08:00:00Z",
    endDatetime: null,
    created: "2026-08-01T09:00:00Z",
    lastUpdated: "2026-08-01T09:00:00Z",
    hasDetails: false,
    impactFactor: 0,
    longTerm: false,
    inaccurate: false,
    lines: [],
    vehicles: [],
    stations: [],
    categories: [],
    chronologies: [],
    voteScore: 0,
    voteBreakdown: { upvotes: 0, downvotes: 0 },
    userVote: 0,
    medias: [],
    ...overrides,
  };
}

function makeModel(overrides: Partial<IncidentFormModel> = {}): IncidentFormModel {
  return {
    title: "T",
    brief: "B",
    details: "",
    startDatetime: "2026-08-01T08:00",
    endDatetime: "",
    severity: "MAJOR",
    longTerm: false,
    inaccurate: false,
    ...overrides,
  };
}

describe("pending-incident.util", () => {
  it("maps severity to its badge variant and label", () => {
    expect(severityBadgeVariant("MAJOR")).toBe("destructive");
    expect(severityBadgeVariant("MINOR")).toBe("warning");
    expect(severityBadgeVariant("OTHERS")).toBe("neutral");

    expect(severityLabelText("MAJOR")).toBe("Major");
    expect(severityLabelText("MINOR")).toBe("Minor");
    expect(severityLabelText("OTHERS")).toBe("Other");
  });

  it("asCalendarIncident copies every field the embedded card reads", () => {
    const row = makeRow({
      status: "LIVE",
      lines: [{ id: "l1", code: "KJL", displayName: "Kelana Jaya" }],
      chronologies: [
        {
          id: "chr-1",
          order: 0,
          indicator: "BLUE",
          datetime: "2026-08-01T08:00:00Z",
          content: "Start",
          sourceUrl: null,
        },
      ],
    });

    const incident = asCalendarIncident(row);

    expect(incident.id).toBe("inc-1");
    expect(incident.title).toBe("LRT line down");
    expect(incident.severity).toBe("MAJOR");
    expect(incident.status).toBe("LIVE");
    expect(incident.lines).toBe(row.lines);
    expect(incident.chronologies).toBe(row.chronologies);
    expect(incident.voteBreakdown).toBe(row.voteBreakdown);
  });

  it("isIncidentFormSaveable requires the schema fields and end >= start", () => {
    expect(isIncidentFormSaveable(makeModel())).toBe(true);

    expect(isIncidentFormSaveable(makeModel({ title: "   " }))).toBe(false);
    expect(isIncidentFormSaveable(makeModel({ brief: "" }))).toBe(false);
    expect(isIncidentFormSaveable(makeModel({ startDatetime: "" }))).toBe(false);
    expect(isIncidentFormSaveable(makeModel({ severity: "" }))).toBe(false);

    expect(
      isIncidentFormSaveable(
        makeModel({ startDatetime: "2026-08-01T08:00", endDatetime: "2026-07-01T08:00" }),
      ),
    ).toBe(false);
    expect(
      isIncidentFormSaveable(
        makeModel({ startDatetime: "2026-08-01T08:00", endDatetime: "2026-08-01T08:00" }),
      ),
    ).toBe(true);
  });

  it("builds the updated row from the form state and prefers reference data", () => {
    const row = makeRow({
      lines: [{ id: "l1", code: "OLD", displayName: "Old line" }],
      categories: [],
      chronologies: [
        {
          id: "chr-1",
          order: 0,
          indicator: "RED",
          datetime: "2026-08-01T08:00:00Z",
          content: "Old",
          sourceUrl: null,
        },
      ],
    });

    const updated = buildUpdatedIncidentRow({
      row,
      model: makeModel({
        title: "Fixed title",
        brief: "Fixed brief",
        details: "Fixed details",
        startDatetime: "2026-08-01T08:30",
        endDatetime: "",
        longTerm: true,
        inaccurate: true,
      }),
      impactFactor: 3,
      chronologies: [
        {
          key: 1,
          indicator: "GREEN",
          datetime: "2026-08-01T09:00",
          sourceUrl: "https://x.com/fix",
          content: "Fixed",
          collapsed: false,
        },
      ],
      selectedLineIds: ["l1", "l2"],
      selectedVehicleIds: ["v9"],
      selectedStationIds: [],
      selectedCategoryIds: [],
      linesById: new Map([
        ["l1", { id: "l1", code: "KJL", displayName: "Kelana Jaya" }],
        ["l2", { id: "l2", code: "SPL", displayName: "Sri Petaling" }],
      ]),
      vehiclesById: new Map(),
      stationsById: new Map(),
      categoriesById: new Map(),
    });

    expect(updated.id).toBe("inc-1");
    expect(updated.title).toBe("Fixed title");
    expect(updated.hasDetails).toBe(true);
    expect(updated.startDatetime).toBe(new Date("2026-08-01T08:30").toISOString());
    expect(updated.endDatetime).toBeNull();
    expect(updated.impactFactor).toBe(3);
    expect(updated.longTerm).toBe(true);
    expect(updated.inaccurate).toBe(true);
    // "l1" is in the row AND the reference map → reference wins.
    expect(updated.lines).toEqual([
      { id: "l1", code: "KJL", displayName: "Kelana Jaya" },
      { id: "l2", code: "SPL", displayName: "Sri Petaling" },
    ]);
    // Vehicles/stations/categories resolve to [] (no ids selected).
    expect(updated.vehicles).toEqual([]);
    expect(updated.stations).toEqual([]);
    expect(updated.categories).toEqual([]);
    expect(updated.chronologies).toEqual([
      {
        order: 0,
        indicator: "GREEN",
        datetime: new Date("2026-08-01T09:00").toISOString(),
        content: "Fixed",
        sourceUrl: "https://x.com/fix",
      },
    ]);
  });

  it("buildUpdatedIncidentRow falls back to the row's own objects when reference data is missing", () => {
    const existing = { id: "l1", code: "OLD", displayName: "Old line" };
    const row = makeRow({ lines: [existing] });

    const updated = buildUpdatedIncidentRow({
      row,
      model: makeModel(),
      impactFactor: 0,
      chronologies: [],
      selectedLineIds: ["l1"],
      selectedVehicleIds: [],
      selectedStationIds: [],
      selectedCategoryIds: [],
      linesById: new Map(),
      vehiclesById: new Map(),
      stationsById: new Map(),
      categoriesById: new Map(),
    });

    expect(updated.lines).toEqual([existing]);
  });

  it("exports the ChronologyExtractState shape", () => {
    const state: ChronologyExtractState = {
      extracting: true,
      lateResult: null,
      preReplaceSnapshot: null,
      replaced: false,
    };
    expect(state.extracting).toBe(true);
  });
});
