import { describe, expect, it } from "vitest";

import {
  STATION_PAGE_QUERY,
  STATION_REPORTS_PER_LINE,
  stationReportsRequest,
} from "./station.queries";

/** The text of one aliased root field's argument list, e.g. `current: calendarIncidents(...)`. */
function argumentsOf(doc: string, alias: string): string {
  const start = doc.indexOf(`${alias}: calendarIncidents(`);
  if (start < 0) {
    throw new Error(`the document has no ${alias} incidents read`);
  }
  return doc.slice(start, doc.indexOf(")", start));
}

describe("STATION_PAGE_QUERY", () => {
  it("takes the route's id as its only variable", () => {
    expect(STATION_PAGE_QUERY).toContain("query StationPage($id: ID!)");
    expect(STATION_PAGE_QUERY.match(/\$\w+/g)?.filter((name) => name !== "$id")).toEqual([]);
    expect(STATION_PAGE_QUERY).toContain("stations(filters: { id: $id })");
  });

  it.each(["current", "history"])(
    "sends status LIVE on the %s incidents, because the root field has no status gate of its own",
    (alias) => {
      const args = argumentsOf(STATION_PAGE_QUERY, alias);
      expect(args).toContain("status: LIVE");
      expect(args).toContain("stations: { id: $id }");
      expect(args).toContain("order: { startDatetime: DESC }");
    },
  );

  it("splits the incidents on the backend's clock, so the two lists never share one", () => {
    expect(argumentsOf(STATION_PAGE_QUERY, "current")).toContain("activeNow: true");
    expect(argumentsOf(STATION_PAGE_QUERY, "history")).toContain("activeNow: false");
  });

  it("never selects Asset.stations, Asset.station or a location", () => {
    expect(STATION_PAGE_QUERY).not.toMatch(/\bstation\b|location/);
    const assets = STATION_PAGE_QUERY.slice(
      STATION_PAGE_QUERY.indexOf("assets {"),
      STATION_PAGE_QUERY.indexOf("}", STATION_PAGE_QUERY.indexOf("assets {")),
    );
    expect(assets).not.toContain("stations");
  });
});

describe("stationReportsRequest", () => {
  it("reads every line's newest reports in one request, each line id a variable", () => {
    const { query, variables } = stationReportsRequest(["6", "8"]);

    expect(query).toContain("query StationReports($first: Int!, $line0: ID!, $line1: ID!)");
    expect(query).toContain("line0: lineStatusReports(lineId: $line0, first: $first)");
    expect(query).toContain("line1: lineStatusReports(lineId: $line1, first: $first)");
    expect(query).toContain("fragment StationReportFields on LineStatusReportScalar");
    expect(variables).toEqual({ first: STATION_REPORTS_PER_LINE, line0: "6", line1: "8" });
  });

  it("never writes a line id into the document text", () => {
    const { query } = stationReportsRequest(["12345"]);
    expect(query).not.toContain("12345");
  });

  it("selects what the rows render plus the station ids it filters on, and no reporter", () => {
    const { query } = stationReportsRequest(["1"]);
    const fragment = query.slice(query.indexOf("fragment StationReportFields"));
    for (const field of ["id", "status", "delayMinutes", "notes", "created", "stations"]) {
      expect(fragment).toMatch(new RegExp(`\\b${field}\\b`));
    }
    expect(fragment).not.toContain("user");
    expect(fragment).not.toContain("displayName");
  });

  it("refuses an empty list, which would be an invalid document", () => {
    expect(() => stationReportsRequest([])).toThrow(/at least one line/);
  });
});
