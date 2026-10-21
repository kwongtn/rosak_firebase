import { describe, expect, it } from "vitest";

import { emptyChronology } from "./chronology-list.util";
import {
  applyExtractionToChronology,
  clampTitle,
  describeFillNotes,
  describeFormFill,
  extractionWindow,
  FALLBACK_LOOKBACK_DAYS,
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
  { id: "13", label: "Bukit Nanas", names: ["Bukit Nanas"] },
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

describe("extractionWindow", () => {
  const now = new Date("2026-10-22T06:30:00Z");
  const dayMs = 86_400_000;

  it("starts at local midnight of the Start date when the rider has set one", () => {
    expect(extractionWindow(now, "2026-08-01T08:00")).toEqual({
      now,
      notBefore: new Date(2026, 7, 1, 0, 0),
    });
  });

  it("falls back to the last FALLBACK_LOOKBACK_DAYS days while Start is empty or malformed", () => {
    const fallback = new Date(now.getTime() - FALLBACK_LOOKBACK_DAYS * dayMs);
    expect(extractionWindow(now, "").notBefore).toEqual(fallback);
    expect(extractionWindow(now, "soon").notBefore).toEqual(fallback);
  });

  it("rejects last year's guess for a date written without a year while Start is empty", () => {
    const window = extractionWindow(now, "");
    expect(plausibleDatetime("2025-10-03T09:00:00+08:00", window)).toBeNull();
    expect(plausibleDatetime("2026-10-03T09:00:00+08:00", window)).toBe(
      "2026-10-03T09:00:00+08:00",
    );
  });

  it("keeps a time up to the lookback and drops one just past it", () => {
    const window = extractionWindow(now, "");
    const edge = now.getTime() - FALLBACK_LOOKBACK_DAYS * dayMs;
    expect(plausibleDatetime(new Date(edge).toISOString(), window)).not.toBeNull();
    expect(plausibleDatetime(new Date(edge - 1).toISOString(), window)).toBeNull();
  });

  it("opens up to an older incident once Start is set to it", () => {
    const window = extractionWindow(now, "2026-06-01T08:00");
    expect(plausibleDatetime("2026-06-02T12:00:00Z", window)).toBe("2026-06-02T12:00:00Z");
    expect(plausibleDatetime("2026-05-30T00:00:00Z", window)).toBeNull();
  });
});

describe("clampTitle", () => {
  const long =
    "Signal fault disrupts LRT Kelana Jaya Line services between KL Sentral and Pasar Seni";

  it("leaves a title that fits as it is, apart from tidying whitespace", () => {
    expect(clampTitle("Signal fault at KL Sentral")).toBe("Signal fault at KL Sentral");
    expect(clampTitle("  Flood \n at Sentul ")).toBe("Flood at Sentul");
  });

  it("keeps exactly 64 characters and cuts at 65", () => {
    const sixtyFour = `${"a".repeat(40)} ${"b".repeat(23)}`;
    expect(sixtyFour).toHaveLength(64);
    expect(clampTitle(sixtyFour)).toBe(sixtyFour);
    // One character more and the last word no longer fits.
    expect(clampTitle(`${"a".repeat(40)} ${"b".repeat(24)}`)).toBe("a".repeat(40));
  });

  it("cuts a long title at a word boundary, within the backend column", () => {
    expect(long.length).toBeGreaterThan(64);
    const clamped = clampTitle(long);
    expect(clamped.length).toBeLessThanOrEqual(64);
    expect(long.startsWith(clamped)).toBe(true);
    // The next character of the original is a space: no word was cut in half.
    expect(long[clamped.length]).toBe(" ");
    expect(clamped).toBe("Signal fault disrupts LRT Kelana Jaya Line services between KL");
  });

  it("keeps the whole word when the cut lands exactly on a word boundary", () => {
    const text = `${"a".repeat(31)} ${"b".repeat(32)} tail`;
    expect(text[64]).toBe(" ");
    expect(clampTitle(text)).toBe(`${"a".repeat(31)} ${"b".repeat(32)}`);
  });

  it("cuts hard when there is no word boundary in the back half", () => {
    expect(clampTitle("a".repeat(70))).toBe("a".repeat(64));
    // The only space is in the front half, so the word that follows is cut rather than dropped.
    expect(clampTitle(`ab ${"c".repeat(70)}`)).toBe(`ab ${"c".repeat(61)}`);
  });

  it("drops a separator left dangling by the cut", () => {
    expect(clampTitle(`${"x".repeat(40)}, ${"y".repeat(40)}`)).toBe("x".repeat(40));
    expect(clampTitle(`${"x".repeat(40)} - ${"y".repeat(40)}`)).toBe("x".repeat(40));
  });

  it("never leaves half an emoji behind", () => {
    const clamped = clampTitle(`${"a".repeat(63)}\u{1F600}b`);
    expect(clamped).toBe("a".repeat(63));
    expect(clamped).not.toMatch(/[\uD800-\uDBFF]$/);
  });

  it("is empty for blank input or input that is only separators", () => {
    expect(clampTitle("")).toBe("");
    expect(clampTitle("   ")).toBe("");
    expect(clampTitle("-".repeat(80))).toBe("");
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

  it("is not fuzzy: a partial name or one with extra words is unmatched", () => {
    const result = matchReferenceNames(
      ["Sentul", "Kelana Jaya Extension", "Kelana", "Pasar"],
      [...LINES, ...STATIONS],
    );
    expect(result.matched).toEqual([]);
    expect(result.unmatched).toEqual(["Sentul", "Kelana Jaya Extension", "Kelana", "Pasar"]);
  });

  describe("operator prefix and line/station suffix", () => {
    it("matches a line the model names without its operator prefix or with a 'Line' suffix", () => {
      const result = matchReferenceNames(
        ["Kelana Jaya Line", "LRT Kelana Jaya", "kelana jaya", "Ampang Line", "KL Monorail"],
        LINES,
      );
      expect(result.matched.map((o) => o.id)).toEqual(["4", "5", "1"]);
      expect(result.unmatched).toEqual([]);
    });

    it("matches a line by its code with a 'Line' suffix and no operator", () => {
      expect(matchReferenceNames(["KJL Line", "agl"], LINES).matched.map((o) => o.id)).toEqual([
        "4",
        "5",
      ]);
    });

    it("matches a station the model calls a 'Station' or prefixes with the operator", () => {
      const result = matchReferenceNames(
        ["Bukit Nanas Station", "LRT Pasar Seni", "MRT KL Sentral Station"],
        STATIONS,
      );
      expect(result.matched.map((o) => o.id)).toEqual(["13", "11", "10"]);
      expect(result.unmatched).toEqual([]);
    });

    it("lets an exact name win over a loose one", () => {
      const options: ReferenceMatchOption[] = [
        { id: "a", label: "Ampang", names: ["Ampang"] },
        { id: "b", label: "AGL", names: ["LRT Ampang Line"] },
      ];
      expect(matchReferenceNames(["Ampang"], options).matched.map((o) => o.id)).toEqual(["a"]);
      expect(matchReferenceNames(["LRT Ampang Line"], options).matched.map((o) => o.id)).toEqual([
        "b",
      ]);
    });

    it("does not guess when two options share a loose name, and reports it unmatched", () => {
      const options: ReferenceMatchOption[] = [
        { id: "a", label: "Ampang", names: ["Ampang"] },
        { id: "b", label: "AGL", names: ["LRT Ampang Line"] },
        { id: "x", label: "LRT Foo", names: ["LRT Foo Line"] },
        { id: "y", label: "MRT Foo", names: ["MRT Foo Line"] },
      ];
      const result = matchReferenceNames(["Ampang Line", "Foo Line", "MRT Foo Line"], options);
      expect(result.matched.map((o) => o.id)).toEqual(["y"]);
      expect(result.unmatched).toEqual(["Ampang Line", "Foo Line"]);
    });

    it("does not let a bare operator or a bare 'line' match anything", () => {
      const result = matchReferenceNames(
        ["LRT", "Line", "LRT Line", "Station"],
        [...LINES, ...STATIONS],
      );
      expect(result.matched).toEqual([]);
      expect(result.unmatched).toEqual(["LRT", "Line", "LRT Line", "Station"]);
    });

    it("only strips the prefix and suffix, never a word in the middle", () => {
      expect(matchReferenceNames(["Kelana LRT Jaya"], LINES).matched).toEqual([]);
      expect(matchReferenceNames(["Pasar Line Seni"], STATIONS).matched).toEqual([]);
    });
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

  it("says the names were never compared when the reference data is not loaded", () => {
    expect(planFormFill(empty, data, null).namesUnchecked).toBe(true);
    expect(planFormFill(empty, data, reference).namesUnchecked).toBe(false);
  });

  it("has nothing unchecked when the extraction named no line or station, or none could be placed", () => {
    const unnamed = { ...data, affected_lines: [], affected_stations: [] };
    expect(planFormFill(empty, unnamed, null).namesUnchecked).toBe(false);
    expect(
      planFormFill(empty, { ...unnamed, affected_lines: ["", "  "] }, null).namesUnchecked,
    ).toBe(false);
    const placed = { ...empty, lineIds: ["4"], stationIds: ["10"] };
    expect(planFormFill(placed, data, null).namesUnchecked).toBe(false);
    // A line is still unplaced, so its names went unchecked.
    expect(planFormFill({ ...placed, lineIds: [] }, data, null).namesUnchecked).toBe(true);
  });

  it("cuts a title longer than the backend column and fills nothing unusable", () => {
    const longTitle =
      "Signal fault disrupts LRT Kelana Jaya Line services between KL Sentral and Pasar Seni";
    const fill = planFormFill(empty, { ...data, title: longTitle }, reference);
    expect(fill.title).toBe("Signal fault disrupts LRT Kelana Jaya Line services between KL");
    expect(fill.title?.length).toBeLessThanOrEqual(64);
    expect(planFormFill(empty, { ...data, title: "-".repeat(90) }, reference).title).toBeNull();
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
      namesUnchecked: false,
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

describe("describeFillNotes", () => {
  const empty: FormFillCurrent = { title: "", severity: "", lineIds: [], stationIds: [] };
  const reference = { lines: LINES, stations: STATIONS };
  const named = { ...EXTRACTED, affected_lines: ["MRL"], affected_stations: [] as string[] };

  it("has nothing to add for an ordinary fill", () => {
    expect(describeFillNotes(planFormFill(empty, named, reference), false)).toEqual([]);
  });

  it("says when the time it found was refused", () => {
    expect(describeFillNotes(planFormFill(empty, named, reference), true)).toEqual([
      "The time it found looks out of range, so the row's time was left as it was.",
    ]);
  });

  it("says when lines and stations were never compared", () => {
    expect(describeFillNotes(planFormFill(empty, named, null), false)).toEqual([
      "Lines and stations were not matched because their list has not loaded.",
    ]);
  });

  it("gives both notes in that order", () => {
    expect(describeFillNotes(planFormFill(empty, named, null), true)).toHaveLength(2);
    expect(describeFillNotes(planFormFill(empty, named, null), true)[0]).toMatch(/out of range/);
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
