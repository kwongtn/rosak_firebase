import { describe, expect, it } from "vitest";

import { INSIDEN_MONTHLY_HISTORY_QUERY } from "./insiden-history.queries";

/*
 * A GraphQL document is a STRING: nothing checks it against `SeverityCountRow`, so a field can be
 * dropped or a default forgotten and the build still passes. These assertions pin the three things
 * the chart silently depends on. Whitespace is collapsed first so Prettier's reflow of the embedded
 * document cannot break them.
 */
const queryText = INSIDEN_MONTHLY_HISTORY_QUERY.replace(/\s+/g, " ").trim();

describe("INSIDEN_MONTHLY_HISTORY_QUERY", () => {
  it("takes the two dates as required Date variables", () => {
    // The resolver raises "start_date and end_date required" without both, so a nullable variable
    // would only move that failure to runtime.
    expect(queryText).toContain("query InsidenMonthlyHistory($startDate: Date!, $endDate: Date!)");
  });

  it("asks for the MONTH grouping and passes both bounds through", () => {
    // `groupBy` defaults to DAY, which builds one SQL aggregate per day and fails for a window of
    // 278 days or more; dropping the argument would be accepted by the schema and wreck a
    // two-year window.
    expect(queryText).toContain(
      "calendarIncidentsBySeverityCount(startDate: $startDate, endDate: $endDate, groupBy: MONTH)",
    );
  });

  it("selects exactly the three fields the bucketing reads", () => {
    // `isLongTerm` is always null in MONTH mode, so it is not requested.
    const selection = /groupBy: MONTH\) \{ ([^{}]*) \}/.exec(queryText)?.[1];

    expect(selection?.split(" ")).toEqual(["severity", "date", "count"]);
  });

  it("no longer reads the incidents themselves", () => {
    expect(queryText).not.toContain("calendarIncidents(");
    expect(queryText).not.toContain("startDatetime");
  });
});
