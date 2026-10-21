import { describe, expect, it } from "vitest";

import {
  emptyIncidentFilterUrlState,
  filterIncidents,
  incidentFilterQueryPatch,
  incidentLineOptions,
  isIncidentFilterActive,
  isMineActive,
  parseLineIdsParam,
  readIncidentFilterUrlState,
  resolveIncidentFilter,
  severityFromSelectValue,
  unlistedLineIds,
  withLineToggled,
  withMineToggled,
} from "./incident-filter.util";
import type { CalendarIncident } from "./insiden.queries";

const KJL = { id: "3", code: "KJL", displayName: "Kelana Jaya Line" };
const AG = { id: "1", code: "AG", displayName: "Ampang Line" };
const KGL = { id: "10", code: "KGL", displayName: "Kajang Line" };
const KTM2 = { id: "20", code: "KTM2", displayName: "KTM Komuter 2" };
const KTM10 = { id: "21", code: "KTM10", displayName: "KTM Komuter 10" };

function incident(
  id: string,
  severity: CalendarIncident["severity"],
  lines: CalendarIncident["lines"],
): CalendarIncident {
  return { id, severity, lines } as unknown as CalendarIncident;
}

const MAJOR_KJL = incident("a", "MAJOR", [KJL]);
const MINOR_KJL_AG = incident("b", "MINOR", [KJL, AG]);
const MINOR_KGL = incident("c", "MINOR", [KGL]);
const OTHERS_NONE = incident("d", "OTHERS", []);
const ALL = [MAJOR_KJL, MINOR_KJL_AG, MINOR_KGL, OTHERS_NONE];

/** Minimal `ParamMap` stand-in — the read helpers only ever call `get`. */
function params(values: Record<string, string>) {
  return { get: (name: string): string | null => values[name] ?? null };
}

describe("incident-filter.util: filterIncidents", () => {
  it("returns the very same array when no filter is active", () => {
    // Reference equality is the point: `allIncidents` is a computed, and a fresh array on every
    // read would re-render the calendar and both lists for nothing.
    expect(filterIncidents(ALL, { lineIds: [], severity: null })).toBe(ALL);
  });

  it("keeps an incident that touches ANY selected line", () => {
    const result = filterIncidents(ALL, { lineIds: ["1", "10"], severity: null });

    expect(result.map((entry) => entry.id)).toEqual(["b", "c"]);
  });

  it("filters by severity alone", () => {
    expect(
      filterIncidents(ALL, { lineIds: [], severity: "MINOR" }).map((entry) => entry.id),
    ).toEqual(["b", "c"]);
    expect(
      filterIncidents(ALL, { lineIds: [], severity: "MAJOR" }).map((entry) => entry.id),
    ).toEqual(["a"]);
  });

  it("requires BOTH axes when both are set", () => {
    const result = filterIncidents(ALL, { lineIds: ["3"], severity: "MINOR" });

    expect(result.map((entry) => entry.id)).toEqual(["b"]);
  });

  it("drops an incident with no lines the moment a line filter is on", () => {
    // A vehicle- or station-only incident cannot be said to be "on my line".
    expect(filterIncidents(ALL, { lineIds: ["3"], severity: null })).not.toContain(OTHERS_NONE);
  });

  it("never offers OTHERS as a severity filter, so an OTHERS incident only shows unfiltered", () => {
    expect(filterIncidents(ALL, { lineIds: [], severity: "MAJOR" })).not.toContain(OTHERS_NONE);
    expect(filterIncidents(ALL, { lineIds: [], severity: null })).toContain(OTHERS_NONE);
  });

  it("returns an empty list, not the input, when nothing matches", () => {
    expect(filterIncidents(ALL, { lineIds: ["999"], severity: null })).toEqual([]);
  });
});

describe("incident-filter.util: isIncidentFilterActive", () => {
  it("is false for the empty criteria and true for either axis", () => {
    expect(isIncidentFilterActive({ lineIds: [], severity: null })).toBe(false);
    expect(isIncidentFilterActive({ lineIds: ["1"], severity: null })).toBe(true);
    expect(isIncidentFilterActive({ lineIds: [], severity: "MAJOR" })).toBe(true);
  });
});

describe("incident-filter.util: incidentLineOptions", () => {
  it("lists each referenced line once", () => {
    const options = incidentLineOptions([MAJOR_KJL, MINOR_KJL_AG], []);

    expect(options.map((option) => option.id).sort()).toEqual(["1", "3"]);
  });

  it("carries the code and display name for the chip and its tooltip", () => {
    expect(incidentLineOptions([MAJOR_KJL], [])[0]).toEqual({
      id: "3",
      code: "KJL",
      displayName: "Kelana Jaya Line",
      pinned: false,
    });
  });

  it("leads with the reader's pinned lines, then sorts by code", () => {
    const options = incidentLineOptions([MAJOR_KJL, MINOR_KJL_AG, MINOR_KGL], ["10"]);

    expect(options.map((option) => option.code)).toEqual(["KGL", "AG", "KJL"]);
    expect(options[0]?.pinned).toBe(true);
    expect(options[1]?.pinned).toBe(false);
  });

  it("sorts codes numeric-aware, so KTM2 comes before KTM10", () => {
    const options = incidentLineOptions(
      [incident("x", "MINOR", [KTM10]), incident("y", "MINOR", [KTM2])],
      [],
    );

    expect(options.map((option) => option.code)).toEqual(["KTM2", "KTM10"]);
  });

  it("gives a pinned line no chip when no loaded incident references it", () => {
    // Its label would need a lines lookup this page does not make.
    const options = incidentLineOptions([MAJOR_KJL], ["3", "77"]);

    expect(options.map((option) => option.id)).toEqual(["3"]);
  });

  it("is empty for an empty window", () => {
    expect(incidentLineOptions([], ["3"])).toEqual([]);
  });
});

describe("incident-filter.util: unlistedLineIds", () => {
  it("reports selected ids that have no chip, so an active filter is never invisible", () => {
    const options = incidentLineOptions([MAJOR_KJL], []);

    expect(unlistedLineIds(["3", "77", "88"], options)).toEqual(["77", "88"]);
    expect(unlistedLineIds([], options)).toEqual([]);
  });
});

describe("incident-filter.util: parseLineIdsParam", () => {
  it("splits on commas and trims", () => {
    expect(parseLineIdsParam(" 3, 10 ,1 ")).toEqual(["3", "10", "1"]);
  });

  it("de-duplicates, first occurrence wins", () => {
    expect(parseLineIdsParam("3,10,3")).toEqual(["3", "10"]);
  });

  it("drops blank and malformed entries instead of throwing", () => {
    expect(parseLineIdsParam("3,,<script>,10,a b,%20")).toEqual(["3", "10"]);
  });

  it("collapses absent and blank to an empty list", () => {
    expect(parseLineIdsParam(null)).toEqual([]);
    expect(parseLineIdsParam(undefined)).toEqual([]);
    expect(parseLineIdsParam("   ")).toEqual([]);
  });
});

describe("incident-filter.util: URL state", () => {
  it("reads lines, severity and mine from the params", () => {
    expect(
      readIncidentFilterUrlState(params({ lines: "3,10", severity: "major", mine: "1" })),
    ).toEqual({ lineIds: ["3", "10"], severity: "MAJOR", mine: true });
  });

  it("reads an empty URL as the empty state", () => {
    expect(readIncidentFilterUrlState(params({}))).toEqual(emptyIncidentFilterUrlState());
    expect(readIncidentFilterUrlState(null)).toEqual(emptyIncidentFilterUrlState());
  });

  it("degrades an unrecognised severity or mine to the default instead of coercing it", () => {
    // `PRO`-style near misses must not become a value the UI never offered.
    expect(readIncidentFilterUrlState(params({ severity: "MAJOR", mine: "true" }))).toEqual(
      emptyIncidentFilterUrlState(),
    );
    expect(readIncidentFilterUrlState(params({ severity: "others" })).severity).toBeNull();
  });

  it("writes a default as null, which REMOVES the key, so a plain page carries no parameter", () => {
    expect(incidentFilterQueryPatch(emptyIncidentFilterUrlState())).toEqual({
      lines: null,
      severity: null,
      mine: null,
    });
  });

  it("writes active state as the strings the read half parses back", () => {
    const state = { lineIds: ["3", "10"], severity: "MINOR" as const, mine: false };
    const patch = incidentFilterQueryPatch(state);

    expect(patch).toEqual({ lines: "3,10", severity: "minor", mine: null });
    // Round trip: a null key is absent from the URL, a string key is what the read half parses.
    const query: Record<string, string> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (typeof value === "string") {
        query[key] = value;
      }
    }
    expect(readIncidentFilterUrlState(params(query))).toEqual(state);
  });

  it("writes mine=1 only when it is on", () => {
    expect(incidentFilterQueryPatch({ lineIds: [], severity: null, mine: true })["mine"]).toBe("1");
  });
});

describe("incident-filter.util: resolveIncidentFilter", () => {
  it("uses the explicit line selection when the URL names lines", () => {
    expect(
      resolveIncidentFilter({ lineIds: ["3"], severity: null, mine: false }, ["1", "10"]),
    ).toEqual({ lineIds: ["3"], severity: null });
  });

  it("an explicit selection wins over mine", () => {
    expect(
      resolveIncidentFilter({ lineIds: ["3"], severity: null, mine: true }, ["1", "10"]).lineIds,
    ).toEqual(["3"]);
  });

  it("seeds the line selection from the pinned lines when mine is on", () => {
    expect(
      resolveIncidentFilter({ lineIds: [], severity: "MAJOR", mine: true }, ["1", "10"]),
    ).toEqual({ lineIds: ["1", "10"], severity: "MAJOR" });
  });

  it("applies NO line filter when mine is on but nothing is pinned", () => {
    // "No pins" is not "no incidents on my lines".
    expect(resolveIncidentFilter({ lineIds: [], severity: null, mine: true }, []).lineIds).toEqual(
      [],
    );
  });

  it("returns a copy of the pins, so a later edit cannot mutate the preferences array", () => {
    const pins = ["1"];

    const result = resolveIncidentFilter({ lineIds: [], severity: null, mine: true }, pins);

    expect(result.lineIds).not.toBe(pins);
  });

  it("carries severity through with no lines", () => {
    expect(resolveIncidentFilter({ lineIds: [], severity: "MINOR", mine: false }, ["1"])).toEqual({
      lineIds: [],
      severity: "MINOR",
    });
  });
});

describe("incident-filter.util: state transitions", () => {
  it("isMineActive is false when an explicit selection overrides mine", () => {
    expect(isMineActive({ lineIds: [], severity: null, mine: true })).toBe(true);
    expect(isMineActive({ lineIds: ["3"], severity: null, mine: true })).toBe(false);
    expect(isMineActive({ lineIds: [], severity: null, mine: false })).toBe(false);
  });

  it("pressing My lines turns it on and REPLACES an explicit selection", () => {
    expect(withMineToggled({ lineIds: ["3"], severity: "MAJOR", mine: false })).toEqual({
      lineIds: [],
      severity: "MAJOR",
      mine: true,
    });
  });

  it("pressing My lines again turns it off and leaves the severity alone", () => {
    expect(withMineToggled({ lineIds: [], severity: "MAJOR", mine: true })).toEqual({
      lineIds: [],
      severity: "MAJOR",
      mine: false,
    });
  });

  it("pressing My lines when an explicit selection overrides mine switches mine back on", () => {
    // `mine=1&lines=3` hand-edited: the button reads unpressed, so the press must mean "on".
    expect(withMineToggled({ lineIds: ["3"], severity: null, mine: true })).toEqual({
      lineIds: [],
      severity: null,
      mine: true,
    });
  });

  it("a chip pressed while My lines is on edits a COPY of the pins and turns mine off", () => {
    const state = { lineIds: [], severity: null, mine: true };

    expect(withLineToggled(state, ["1", "3", "10"], "3")).toEqual({
      lineIds: ["1", "10"],
      severity: null,
      mine: false,
    });
  });

  it("adds a line that is not selected and removes one that is", () => {
    const state = emptyIncidentFilterUrlState();

    const added = withLineToggled(state, ["3"], "10");
    expect(added.lineIds).toEqual(["3", "10"]);
    expect(withLineToggled(added, added.lineIds, "3").lineIds).toEqual(["10"]);
  });

  it("deselecting the last line leaves an empty selection (no filter), not a stuck one", () => {
    const state = { lineIds: ["3"], severity: null, mine: false };

    expect(withLineToggled(state, ["3"], "3").lineIds).toEqual([]);
  });

  it("maps the severity select's values, with anything else meaning all", () => {
    expect(severityFromSelectValue("major")).toBe("MAJOR");
    expect(severityFromSelectValue("minor")).toBe("MINOR");
    expect(severityFromSelectValue("all")).toBeNull();
    expect(severityFromSelectValue("")).toBeNull();
    expect(severityFromSelectValue("OTHERS")).toBeNull();
  });
});
