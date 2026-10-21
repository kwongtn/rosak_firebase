import { describe, expect, it } from "vitest";

import {
  INCIDENT_CSV_COLUMNS,
  exportFilterTokens,
  incidentCalendarFilename,
  incidentPageUrl,
  incidentToCsvRow,
  incidentToIcsEvent,
  incidentsForMonthExport,
  incidentsStartingInMonth,
  incidentsToCsv,
  incidentsToIcs,
  monthExportFilename,
} from "./incident-export.util";
import type { IncidentLineOption } from "./incident-filter.util";
import type { CalendarIncident } from "./insiden.queries";

const NOW = new Date("2026-10-21T03:15:30Z");

function makeIncident(overrides: Partial<CalendarIncident> = {}): CalendarIncident {
  return {
    id: "42",
    startDatetime: "2026-10-21T08:30:00",
    endDatetime: "2026-10-21T10:00:00",
    severity: "MAJOR",
    status: "LIVE",
    title: "Signal failure at KL Sentral",
    brief: "Trains are slow between KL Sentral and Bangsar",
    lines: [
      { id: "3", code: "KJL", displayName: "Kelana Jaya Line" },
      { id: "1", code: "AG", displayName: "Ampang Line" },
    ],
    stations: [
      { id: "7", displayName: "KL Sentral" },
      { id: "8", displayName: "Bangsar" },
    ],
    vehicles: [],
    ...overrides,
  } as CalendarIncident;
}

/** A CSV as rows of cells, with the CRLF-terminated lines split (no quoted newline in these data). */
function csvRows(csv: string): string[] {
  return csv.split("\r\n").filter((line) => line !== "");
}

function unfold(ics: string): string {
  return ics.replace(/\r\n[ \t]/g, "");
}

describe("incident-export.util: incidentPageUrl", () => {
  it("points at /insiden/<start date> on the public site", () => {
    expect(incidentPageUrl(makeIncident())).toBe(
      "https://community.mlptf.org.my/insiden/2026-10-21",
    );
  });
});

describe("incident-export.util: CSV", () => {
  it("has the seven columns the export promises, in order", () => {
    expect(INCIDENT_CSV_COLUMNS).toEqual([
      "date",
      "title",
      "severity",
      "lines",
      "stations",
      "status",
      "url",
    ]);
  });

  it("maps one incident to a row", () => {
    expect(incidentToCsvRow(makeIncident())).toEqual({
      date: "2026-10-21",
      title: "Signal failure at KL Sentral",
      severity: "MAJOR",
      lines: "KJL; AG",
      stations: "KL Sentral; Bangsar",
      status: "LIVE",
      url: "https://community.mlptf.org.my/insiden/2026-10-21",
    });
  });

  it("writes the header first and one CRLF-terminated line per incident", () => {
    const csv = incidentsToCsv([makeIncident()]);

    expect(csvRows(csv)).toEqual([
      "date,title,severity,lines,stations,status,url",
      "2026-10-21,Signal failure at KL Sentral,MAJOR,KJL; AG,KL Sentral; Bangsar,LIVE,https://community.mlptf.org.my/insiden/2026-10-21",
    ]);
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("is header-only for an empty month rather than an empty document", () => {
    expect(csvRows(incidentsToCsv([]))).toEqual(["date,title,severity,lines,stations,status,url"]);
  });

  it("quotes a title with a comma or a quote through toCsv's own escaping", () => {
    const csv = incidentsToCsv([makeIncident({ title: 'Kajang, "Sri Petaling" delayed' })]);

    expect(csvRows(csv)[1]).toContain('"Kajang, ""Sri Petaling"" delayed"');
  });

  it("upper-cases the status the API sends in either casing and leaves a missing one empty", () => {
    expect(incidentToCsvRow(makeIncident({ status: "pending_approval" }))["status"]).toBe(
      "PENDING_APPROVAL",
    );
    expect(incidentToCsvRow(makeIncident({ status: undefined }))["status"]).toBe("");
  });

  it("writes empty line and station cells for an incident with neither", () => {
    const row = incidentToCsvRow(makeIncident({ lines: [], stations: [] }));

    expect(row["lines"]).toBe("");
    expect(row["stations"]).toBe("");
  });

  it("keeps the order it is given", () => {
    const csv = incidentsToCsv([
      makeIncident({ id: "2", title: "B" }),
      makeIncident({ id: "1", title: "A" }),
    ]);

    expect(csvRows(csv)[1]).toContain(",B,");
    expect(csvRows(csv)[2]).toContain(",A,");
  });
});

describe("incident-export.util: formula neutralisation", () => {
  // The rule itself (`neutralizeSpreadsheetFormula`) is specified in core/export/csv.util.spec.ts;
  // this pins that the incident rows apply it to the cells a community member wrote.
  it("is applied to every user-written cell of an exported row", () => {
    const row = incidentToCsvRow(
      makeIncident({
        title: "=cmd|' /C calc'!A0",
        lines: [{ id: "1", code: "@AG", displayName: "x" }],
        stations: [{ id: "1", displayName: "+Bangsar" }],
      }),
    );

    expect(row["title"]).toBe("'=cmd|' /C calc'!A0");
    expect(row["lines"]).toBe("'@AG");
    expect(row["stations"]).toBe("'+Bangsar");
  });
});

describe("incident-export.util: iCalendar", () => {
  it("builds the event from the incident: stable UID, times, title, brief and URL", () => {
    expect(incidentToIcsEvent(makeIncident())).toEqual({
      uid: "incident-42@community.mlptf.org.my",
      start: "2026-10-21T08:30:00",
      end: "2026-10-21T10:00:00",
      summary: "Signal failure at KL Sentral",
      description: "Trains are slow between KL Sentral and Bangsar",
      url: "https://community.mlptf.org.my/insiden/2026-10-21",
      status: "CONFIRMED",
    });
  });

  it("marks only a LIVE incident CONFIRMED; pending and draft reports are TENTATIVE", () => {
    expect(incidentToIcsEvent(makeIncident({ status: "LIVE" })).status).toBe("CONFIRMED");
    expect(incidentToIcsEvent(makeIncident({ status: "live" })).status).toBe("CONFIRMED");
    expect(incidentToIcsEvent(makeIncident({ status: "PENDING_APPROVAL" })).status).toBe(
      "TENTATIVE",
    );
    expect(incidentToIcsEvent(makeIncident({ status: "DRAFT" })).status).toBe("TENTATIVE");
    expect(incidentToIcsEvent(makeIncident({ status: "REJECTED" })).status).toBe("CANCELLED");
    expect(incidentToIcsEvent(makeIncident({ status: undefined })).status).toBeUndefined();
  });

  it("serialises a single incident to a complete one-event calendar", () => {
    const ics = unfold(incidentsToIcs([makeIncident()], NOW));

    expect(ics).toContain("BEGIN:VEVENT\r\nUID:incident-42@community.mlptf.org.my\r\n");
    expect(ics).toContain("DTSTAMP:20261021T031530Z\r\n");
    expect(ics).toContain("DTSTART;TZID=Asia/Kuala_Lumpur:20261021T083000\r\n");
    expect(ics).toContain("DTEND;TZID=Asia/Kuala_Lumpur:20261021T100000\r\n");
    expect(ics).toContain("SUMMARY:Signal failure at KL Sentral\r\n");
    expect(ics).toContain("DESCRIPTION:Trains are slow between KL Sentral and Bangsar\r\n");
    expect(ics).toContain("URL:https://community.mlptf.org.my/insiden/2026-10-21\r\n");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });

  it("writes no DTEND for an ongoing incident", () => {
    const ics = incidentsToIcs([makeIncident({ endDatetime: null })], NOW);

    expect(ics).not.toContain("DTEND");
    expect(ics).toContain("DTSTART;TZID=Asia/Kuala_Lumpur:20261021T083000");
  });

  it("escapes a title and brief full of ICS metacharacters", () => {
    const ics = unfold(
      incidentsToIcs(
        [makeIncident({ title: "Kajang, Sri Petaling; slow", brief: "line one\nline two" })],
        NOW,
      ),
    );

    expect(ics).toContain("SUMMARY:Kajang\\, Sri Petaling\\; slow\r\n");
    expect(ics).toContain("DESCRIPTION:line one\\nline two\r\n");
  });

  it("emits one event per incident, in order, with distinct UIDs", () => {
    const ics = incidentsToIcs(
      [makeIncident({ id: "1" }), makeIncident({ id: "2" }), makeIncident({ id: "3" })],
      NOW,
    );

    expect(ics.match(/^UID:.*$/gm)).toEqual([
      "UID:incident-1@community.mlptf.org.my",
      "UID:incident-2@community.mlptf.org.my",
      "UID:incident-3@community.mlptf.org.my",
    ]);
  });
});

describe("incident-export.util: incidentsStartingInMonth", () => {
  const OCT_LATE = makeIncident({ id: "5", startDatetime: "2026-10-30T09:00:00" });
  const OCT_EARLY = makeIncident({ id: "6", startDatetime: "2026-10-02T09:00:00" });
  const SEP = makeIncident({ id: "7", startDatetime: "2026-09-30T23:59:00", endDatetime: null });
  const NOV = makeIncident({ id: "8", startDatetime: "2026-11-01T00:00:00" });

  it("keeps only the incidents that STARTED in the month", () => {
    const result = incidentsStartingInMonth([OCT_LATE, SEP, NOV, OCT_EARLY], "2026-10");

    expect(result.map((entry) => entry.id)).toEqual(["6", "5"]);
  });

  it("does not export an incident still running from last month (it belongs to that month's file)", () => {
    expect(incidentsStartingInMonth([SEP], "2026-10")).toEqual([]);
    expect(incidentsStartingInMonth([SEP], "2026-09")).toHaveLength(1);
  });

  it("orders oldest first, breaking a tie by numeric id", () => {
    const tieA = makeIncident({ id: "10", startDatetime: "2026-10-05T09:00:00" });
    const tieB = makeIncident({ id: "9", startDatetime: "2026-10-05T09:00:00" });

    const result = incidentsStartingInMonth([OCT_LATE, tieA, tieB, OCT_EARLY], "2026-10");

    expect(result.map((entry) => entry.id)).toEqual(["6", "9", "10", "5"]);
  });

  it("does not mutate the array it was given", () => {
    const input = [OCT_LATE, OCT_EARLY];

    incidentsStartingInMonth(input, "2026-10");

    expect(input).toEqual([OCT_LATE, OCT_EARLY]);
  });

  it("does not confuse 2026-1 style prefixes: the month key must match exactly", () => {
    expect(incidentsStartingInMonth([OCT_EARLY], "2026-1")).toEqual([]);
  });
});

describe("incident-export.util: incidentsForMonthExport", () => {
  const live = makeIncident({ id: "1", startDatetime: "2026-10-03T09:00:00", status: "LIVE" });
  const liveLower = makeIncident({ id: "2", startDatetime: "2026-10-04T09:00:00", status: "live" });
  const draft = makeIncident({ id: "3", startDatetime: "2026-10-05T09:00:00", status: "DRAFT" });
  const pending = makeIncident({
    id: "4",
    startDatetime: "2026-10-06T09:00:00",
    status: "PENDING_APPROVAL",
  });
  const rejected = makeIncident({
    id: "5",
    startDatetime: "2026-10-07T09:00:00",
    status: "REJECTED",
  });
  const noStatus = makeIncident({ id: "6", startDatetime: "2026-10-08T09:00:00" });
  Reflect.deleteProperty(noStatus, "status");
  const septemberLive = makeIncident({ id: "7", startDatetime: "2026-09-30T09:00:00" });

  it("writes approved incidents only: no draft, pending or rejected report ever leaves the page", () => {
    const result = incidentsForMonthExport(
      [draft, live, pending, rejected, liveLower, noStatus],
      "2026-10",
    );

    // Oldest first, `live` in either casing, nothing unapproved, and a payload with no status at all
    // is not claimed to be approved.
    expect(result.map((entry) => entry.id)).toEqual(["1", "2"]);
  });

  it("is the same set the Last 12 months bar counts for the month: approved, started in it", () => {
    const result = incidentsForMonthExport([live, septemberLive, draft], "2026-10");

    expect(result.map((entry) => entry.id)).toEqual(["1"]);
  });

  it("is empty when every incident of the month is unapproved", () => {
    expect(incidentsForMonthExport([draft, pending, rejected], "2026-10")).toEqual([]);
  });

  it("leaves the all-status month selection alone", () => {
    expect(incidentsStartingInMonth([draft, live], "2026-10")).toHaveLength(2);
  });
});

describe("incident-export.util: filenames", () => {
  const OPTIONS: IncidentLineOption[] = [
    { id: "3", code: "KJL", displayName: "Kelana Jaya Line", pinned: false },
    { id: "1", code: "AG", displayName: "Ampang Line", pinned: false },
  ];

  it("names a month export by its month and format", () => {
    expect(monthExportFilename("2026-10", "csv")).toBe("insiden-2026-10.csv");
    expect(monthExportFilename("2026-10", "ics")).toBe("insiden-2026-10.ics");
  });

  it("names a filtered export after its filter, so it cannot pass for the whole month", () => {
    expect(monthExportFilename("2026-10", "csv", ["KJL", "MAJOR"])).toBe(
      "insiden-2026-10-kjl-major.csv",
    );
    expect(monthExportFilename("2026-10", "ics", ["AG"])).toBe("insiden-2026-10-ag.ics");
  });

  it("reduces a filter word to lower-case letters and digits and drops one that vanishes", () => {
    expect(monthExportFilename("2026-10", "csv", ["../KJ L", "!!", "Major"])).toBe(
      "insiden-2026-10-kjl-major.csv",
    );
    expect(monthExportFilename("2026-10", "csv", [])).toBe("insiden-2026-10.csv");
  });

  it("words a filter as its lines' codes, then the severity", () => {
    expect(exportFilterTokens({ lineIds: ["3", "1"], severity: "MAJOR" }, OPTIONS)).toEqual([
      "KJL",
      "AG",
      "MAJOR",
    ]);
    expect(exportFilterTokens({ lineIds: [], severity: "MINOR" }, OPTIONS)).toEqual(["MINOR"]);
    expect(exportFilterTokens({ lineIds: ["3"], severity: null }, OPTIONS)).toEqual(["KJL"]);
  });

  it("falls back to line<id> for a selected line no chip names, and is empty for no filter", () => {
    expect(exportFilterTokens({ lineIds: ["999"], severity: null }, OPTIONS)).toEqual(["line999"]);
    expect(exportFilterTokens({ lineIds: [], severity: null }, OPTIONS)).toEqual([]);
  });

  it("names a single-incident calendar file by the incident id, reduced to safe characters", () => {
    expect(incidentCalendarFilename(makeIncident({ id: "42" }))).toBe("insiden-incident-42.ics");
    expect(incidentCalendarFilename(makeIncident({ id: "../x y/42" }))).toBe(
      "insiden-incident-xy42.ics",
    );
  });
});
