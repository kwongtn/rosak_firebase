import { describe, expect, it } from "vitest";

import { emptyChronology } from "./chronology-list.util";
import {
  applyExtractionToChronology,
  describeFormFill,
  incidentDayStart,
  isoToDateTimeLocal,
  mapExtractedIndicator,
  mapExtractedSeverity,
  matchReferenceNames,
  planFormFill,
  plausibleDatetime,
  proposeIndicator,
  type FormFillCurrent,
  type ReferenceMatchOption,
} from "./extract-data.util";

describe("isoToDateTimeLocal", () => {
  it("converts an ISO datetime to the datetime-local input format in local time", () => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const local = new Date("2026-08-22T09:30:00Z");
    const expected = `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(
      local.getDate(),
    )}T${pad(local.getHours())}:${pad(local.getMinutes())}`;
    expect(isoToDateTimeLocal("2026-08-22T09:30:00Z")).toBe(expected);
  });

  it("returns empty string for null, empty, or invalid input", () => {
    expect(isoToDateTimeLocal(null)).toBe("");
    expect(isoToDateTimeLocal(undefined)).toBe("");
    expect(isoToDateTimeLocal("")).toBe("");
    expect(isoToDateTimeLocal("not-a-date")).toBe("");
  });
});

describe("applyExtractionToChronology", () => {
  const data = {
    title: "LRT delay",
    datetime: "2026-08-22T09:30:00Z",
    content: "Signal failure at KL Sentral.",
    source_url: "https://example.com/post",
    indicator: "disruption" as const,
    severity: "major" as const,
    affected_lines: [],
    affected_stations: [],
  };

  it("overwrites datetime and content but preserves the user's source URL and indicator", () => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const local = new Date(data.datetime);
    const expectedLocal = `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(
      local.getDate(),
    )}T${pad(local.getHours())}:${pad(local.getMinutes())}`;
    const draft = {
      ...emptyChronology(0),
      sourceUrl: "https://user.example/1",
      indicator: "RED" as const,
    };
    const result = applyExtractionToChronology(draft, data);

    expect(result.datetime).toBe(expectedLocal);
    expect(result.content).toBe("Signal failure at KL Sentral.");
    expect(result.sourceUrl).toBe("https://user.example/1");
    expect(result.indicator).toBe("RED");
  });

  it("keeps the draft's existing values when extraction returns nulls", () => {
    const draft = { ...emptyChronology(1), datetime: "2026-08-01T08:00", content: "Existing" };
    const result = applyExtractionToChronology(draft, { ...data, datetime: null, content: null });

    expect(result.datetime).toBe("2026-08-01T08:00");
    expect(result.content).toBe("Existing");
  });

  it("is a pure projection — the original draft is untouched", () => {
    const draft = emptyChronology(2);
    applyExtractionToChronology(draft, data);
    expect(draft.datetime).toBe("");
    expect(draft.content).toBe("");
  });
});

// The mapping layer: one describe per rule.

const EXTRACTED = {
  title: "LRT delay",
  datetime: "2026-08-22T09:30:00Z",
  content: "Signal failure at KL Sentral.",
  source_url: "https://example.com/post",
  indicator: "disruption" as const,
  severity: "major" as const,
  affected_lines: [] as string[],
  affected_stations: [] as string[],
};

const LINES: ReferenceMatchOption[] = [
  { id: "4", label: "LRT KJL", names: ["LRT KJL", "LRT Kelana Jaya Line"] },
  { id: "5", label: "LRT AGL", names: ["LRT AGL", "LRT Ampang  Line"] },
  { id: "1", label: "MRL", names: ["MRL", "KL Monorail Line"] },
];

const STATIONS: ReferenceMatchOption[] = [
  { id: "10", label: "KL Sentral", names: ["KL Sentral"] },
  { id: "11", label: "Pasar Seni", names: ["Pasar Seni"] },
  { id: "12", label: "Sentul (KTM)", names: ["Sentul (KTM)"] },
];

describe("mapExtractedIndicator", () => {
  it("maps a problem under way to RED", () => {
    expect(mapExtractedIndicator("delay")).toBe("RED");
    expect(mapExtractedIndicator("disruption")).toBe("RED");
    expect(mapExtractedIndicator("accident")).toBe("RED");
  });

  it("maps planned works to BLUE and other to GRAY, never to GREEN", () => {
    expect(mapExtractedIndicator("maintenance")).toBe("BLUE");
    expect(mapExtractedIndicator("other")).toBe("GRAY");
    const kinds = ["delay", "disruption", "accident", "maintenance", "other"];
    expect(kinds.map(mapExtractedIndicator)).not.toContain("GREEN");
  });

  it("ignores case and surrounding whitespace", () => {
    expect(mapExtractedIndicator("  Disruption ")).toBe("RED");
  });

  it("answers null for a word outside the vocabulary, absent input and object prototype keys", () => {
    expect(mapExtractedIndicator("flood")).toBeNull();
    expect(mapExtractedIndicator("")).toBeNull();
    expect(mapExtractedIndicator(null)).toBeNull();
    expect(mapExtractedIndicator(undefined)).toBeNull();
    expect(mapExtractedIndicator("constructor")).toBeNull();
  });
});

describe("mapExtractedSeverity", () => {
  it("maps major, critical and severe to MAJOR", () => {
    expect(mapExtractedSeverity("major")).toBe("MAJOR");
    expect(mapExtractedSeverity("critical")).toBe("MAJOR");
    expect(mapExtractedSeverity("severe")).toBe("MAJOR");
  });

  it("maps minor and moderate to MINOR (moderate takes the safe side)", () => {
    expect(mapExtractedSeverity("minor")).toBe("MINOR");
    expect(mapExtractedSeverity("moderate")).toBe("MINOR");
  });

  it("ignores case and surrounding whitespace", () => {
    expect(mapExtractedSeverity(" MAJOR ")).toBe("MAJOR");
  });

  it("answers null for an unknown, empty or absent severity and never proposes OTHERS", () => {
    expect(mapExtractedSeverity("catastrophic")).toBeNull();
    expect(mapExtractedSeverity("others")).toBeNull();
    expect(mapExtractedSeverity("")).toBeNull();
    expect(mapExtractedSeverity(null)).toBeNull();
    expect(mapExtractedSeverity(undefined)).toBeNull();
  });
});

describe("plausibleDatetime", () => {
  const now = new Date("2026-10-22T06:30:00Z");
  const noFloor = { now, notBefore: null };

  it("returns a datetime inside the window unchanged", () => {
    expect(plausibleDatetime("2026-10-21T12:00:00+08:00", noFloor)).toBe(
      "2026-10-21T12:00:00+08:00",
    );
  });

  it("keeps a time up to exactly one day after now and drops anything later", () => {
    expect(plausibleDatetime("2026-10-23T06:30:00Z", noFloor)).toBe("2026-10-23T06:30:00Z");
    expect(plausibleDatetime("2026-10-23T06:30:00.001Z", noFloor)).toBeNull();
    expect(plausibleDatetime("2027-10-22T06:30:00Z", noFloor)).toBeNull();
  });

  it("drops a time before the incident date and keeps one exactly at its start", () => {
    const window = { now, notBefore: new Date("2026-10-20T00:00:00Z") };
    expect(plausibleDatetime("2026-10-20T00:00:00Z", window)).toBe("2026-10-20T00:00:00Z");
    expect(plausibleDatetime("2026-10-19T23:59:59Z", window)).toBeNull();
  });

  it("has no lower bound while there is no incident date", () => {
    expect(plausibleDatetime("2001-01-01T00:00:00Z", noFloor)).toBe("2001-01-01T00:00:00Z");
  });

  it("treats null, empty and unparseable input as absent", () => {
    expect(plausibleDatetime(null, noFloor)).toBeNull();
    expect(plausibleDatetime(undefined, noFloor)).toBeNull();
    expect(plausibleDatetime("", noFloor)).toBeNull();
    expect(plausibleDatetime("yesterday", noFloor)).toBeNull();
  });
});

describe("incidentDayStart", () => {
  it("is local midnight of the date in a datetime-local value", () => {
    expect(incidentDayStart("2026-08-01T08:00")).toEqual(new Date(2026, 7, 1, 0, 0));
  });

  it("answers null for an empty or malformed value", () => {
    expect(incidentDayStart("")).toBeNull();
    expect(incidentDayStart("soon")).toBeNull();
    expect(incidentDayStart("2026-13-45T08:00")).toBeNull();
  });
});

describe("matchReferenceNames", () => {
  it("matches a line by code or by display name, ignoring case", () => {
    const result = matchReferenceNames(["lrt kjl", "LRT KELANA JAYA LINE"], LINES);
    expect(result.matched.map((o) => o.id)).toEqual(["4"]);
    expect(result.unmatched).toEqual([]);
  });

  it("matches a station by display name", () => {
    expect(
      matchReferenceNames(["kl sentral", "PASAR SENI"], STATIONS).matched.map((o) => o.id),
    ).toEqual(["10", "11"]);
  });

  it("collapses inner whitespace on both sides of the comparison", () => {
    expect(matchReferenceNames(["LRT Ampang Line"], LINES).matched.map((o) => o.id)).toEqual(["5"]);
    expect(matchReferenceNames(["  KL \n Sentral "], STATIONS).matched.map((o) => o.id)).toEqual([
      "10",
    ]);
  });

  it("returns names that match nothing separately, in the model's spelling", () => {
    const result = matchReferenceNames(
      ["KL Sentral", "  Kelana Jaya   Line ", "Bukit Bintang"],
      [...STATIONS],
    );
    expect(result.matched.map((o) => o.id)).toEqual(["10"]);
    expect(result.unmatched).toEqual(["Kelana Jaya Line", "Bukit Bintang"]);
  });

  it("is exact, not fuzzy: a partial name is unmatched", () => {
    const result = matchReferenceNames(["Sentul", "Kelana Jaya"], [...LINES, ...STATIONS]);
    expect(result.matched).toEqual([]);
    expect(result.unmatched).toEqual(["Sentul", "Kelana Jaya"]);
  });

  it("returns each option once, however many names point at it, and keeps mention order", () => {
    const result = matchReferenceNames(["MRL", "KL Monorail Line", "LRT AGL", "mrl"], LINES);
    expect(result.matched.map((o) => o.id)).toEqual(["1", "5"]);
  });

  it("lists a repeated unmatched name once", () => {
    expect(matchReferenceNames(["Foo", "foo", "FOO "], LINES).unmatched).toEqual(["Foo"]);
  });

  it("skips blank and non-string entries, and tolerates a missing or non-array field", () => {
    expect(matchReferenceNames(["", "   ", 7, null, { name: "MRL" }], LINES)).toEqual({
      matched: [],
      unmatched: [],
    });
    expect(matchReferenceNames(undefined, LINES)).toEqual({ matched: [], unmatched: [] });
    expect(matchReferenceNames(null, LINES)).toEqual({ matched: [], unmatched: [] });
    expect(matchReferenceNames("MRL" as unknown as string[], LINES)).toEqual({
      matched: [],
      unmatched: [],
    });
  });

  it("leaves every name unmatched when there are no options", () => {
    expect(matchReferenceNames(["MRL"], [])).toEqual({ matched: [], unmatched: ["MRL"] });
  });
});

describe("planFormFill", () => {
  const empty: FormFillCurrent = { title: "", severity: "", lineIds: [], stationIds: [] };
  const reference = { lines: LINES, stations: STATIONS };
  const data = {
    ...EXTRACTED,
    affected_lines: ["LRT KJL", "Bogus Line"],
    affected_stations: ["KL Sentral", "Nowhere"],
  };

  it("proposes the title, severity, lines and stations when every field is empty", () => {
    const fill = planFormFill(empty, data, reference);
    expect(fill.title).toBe("LRT delay");
    expect(fill.severity).toBe("MAJOR");
    expect(fill.lines.matched.map((o) => o.id)).toEqual(["4"]);
    expect(fill.lines.unmatched).toEqual(["Bogus Line"]);
    expect(fill.stations.matched.map((o) => o.id)).toEqual(["10"]);
    expect(fill.stations.unmatched).toEqual(["Nowhere"]);
  });

  it("proposes the title only when the form's title is blank", () => {
    expect(planFormFill({ ...empty, title: "My own title" }, data, reference).title).toBeNull();
    expect(planFormFill({ ...empty, title: "   " }, data, reference).title).toBe("LRT delay");
  });

  it("trims the title and ignores a missing one", () => {
    expect(planFormFill(empty, { ...data, title: "  Flood \n at Sentul " }, reference).title).toBe(
      "Flood at Sentul",
    );
    expect(planFormFill(empty, { ...data, title: null }, reference).title).toBeNull();
    expect(planFormFill(empty, { ...data, title: "   " }, reference).title).toBeNull();
  });

  it("proposes the severity only while none is chosen", () => {
    expect(planFormFill({ ...empty, severity: "MINOR" }, data, reference).severity).toBeNull();
    expect(planFormFill(empty, { ...data, severity: "moderate" }, reference).severity).toBe(
      "MINOR",
    );
    expect(planFormFill(empty, { ...data, severity: null }, reference).severity).toBeNull();
  });

  it("leaves lines alone once any is selected, and reports nothing unmatched for them", () => {
    const fill = planFormFill({ ...empty, lineIds: ["9"] }, data, reference);
    expect(fill.lines).toEqual({ matched: [], unmatched: [] });
    expect(fill.stations.matched.map((o) => o.id)).toEqual(["10"]);
  });

  it("leaves stations alone once any is selected, and reports nothing unmatched for them", () => {
    const fill = planFormFill({ ...empty, stationIds: ["11"] }, data, reference);
    expect(fill.stations).toEqual({ matched: [], unmatched: [] });
    expect(fill.lines.matched.map((o) => o.id)).toEqual(["4"]);
  });

  it("skips lines and stations entirely while the reference data is not loaded", () => {
    const fill = planFormFill(empty, data, null);
    expect(fill.lines).toEqual({ matched: [], unmatched: [] });
    expect(fill.stations).toEqual({ matched: [], unmatched: [] });
    expect(fill.title).toBe("LRT delay");
    expect(fill.severity).toBe("MAJOR");
  });

  it("proposes nothing for an empty extraction", () => {
    const fill = planFormFill(
      empty,
      { ...data, title: null, severity: null, affected_lines: [], affected_stations: [] },
      reference,
    );
    expect(fill).toEqual({
      title: null,
      severity: null,
      lines: { matched: [], unmatched: [] },
      stations: { matched: [], unmatched: [] },
    });
  });
});

describe("describeFormFill", () => {
  it("lists what was filled, pluralising the counts", () => {
    const fill = planFormFill(
      { title: "", severity: "", lineIds: [], stationIds: [] },
      { ...EXTRACTED, affected_lines: ["LRT KJL", "MRL"], affected_stations: ["KL Sentral"] },
      { lines: LINES, stations: STATIONS },
    );
    expect(describeFormFill(fill)).toBe("title, severity, 2 lines, 1 station");
  });

  it("is empty when nothing was filled", () => {
    const fill = planFormFill(
      { title: "Typed", severity: "MAJOR", lineIds: ["4"], stationIds: ["10"] },
      EXTRACTED,
      { lines: LINES, stations: STATIONS },
    );
    expect(describeFormFill(fill)).toBe("");
  });

  it("does not count names that did not match", () => {
    const fill = planFormFill(
      { title: "Typed", severity: "MAJOR", lineIds: [], stationIds: [] },
      { ...EXTRACTED, affected_lines: ["Bogus Line"] },
      { lines: LINES, stations: STATIONS },
    );
    expect(describeFormFill(fill)).toBe("");
  });
});

describe("proposeIndicator", () => {
  it("proposes the mapped colour for a blank row still on the default", () => {
    expect(proposeIndicator(emptyChronology(0), EXTRACTED)).toBe("RED");
    expect(proposeIndicator(emptyChronology(0), { indicator: "maintenance" })).toBe("BLUE");
    expect(proposeIndicator(emptyChronology(0), { indicator: "other" })).toBe("GRAY");
  });

  it("keeps a colour the rider picked", () => {
    const picked = { ...emptyChronology(0), indicator: "BLUE" as const };
    expect(proposeIndicator(picked, EXTRACTED)).toBe("BLUE");
  });

  it("keeps the colour of a row that already has a time or text", () => {
    expect(proposeIndicator({ ...emptyChronology(0), content: "typed" }, EXTRACTED)).toBe("GREEN");
    expect(
      proposeIndicator({ ...emptyChronology(0), datetime: "2026-08-01T08:00" }, EXTRACTED),
    ).toBe("GREEN");
  });

  it("keeps the row's colour when the extraction's kind is outside the vocabulary", () => {
    const odd = { indicator: "flood" } as unknown as { indicator: "other" };
    expect(proposeIndicator(emptyChronology(0), odd)).toBe("GREEN");
  });
});
