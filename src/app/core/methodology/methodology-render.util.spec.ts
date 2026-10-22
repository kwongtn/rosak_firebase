import { describe, expect, it } from "vitest";

import { METHODOLOGY_CONSTANTS } from "./methodology.constants";
import {
  metricDoc,
  metricTooltip,
  renderMethodologyCopy,
  section,
} from "./methodology-render.util";

describe("methodology render util: renderMethodologyCopy", () => {
  it("resolves a known token from the default constants", () => {
    expect(renderMethodologyCopy("Stale after {{STALE_REVIEW_MONTHS}} months.")).toBe(
      "Stale after 6 months.",
    );
  });

  it("renders a mutated constant differently from the default (proves no hardcoded digit)", () => {
    const template = "Stale after {{STALE_REVIEW_MONTHS}} months.";
    const overridden = renderMethodologyCopy(template, { STALE_REVIEW_MONTHS: 7 });

    expect(overridden).toBe("Stale after 7 months.");
    expect(overridden).not.toBe(renderMethodologyCopy(template));
  });

  it("keeps the page's own needs-review threshold at 6, sourced from the spec", () => {
    expect(METHODOLOGY_CONSTANTS["STALE_REVIEW_MONTHS"]).toEqual({
      value: 6,
      source: "METHODOLOGY_DOCS.md",
    });
  });

  it("adds only the frontend-owned rules and the mirrored backend shapes, and names the spec that owns each", () => {
    // Every OTHER methodology number is backend-owned, so this list is deliberately short. What is
    // here are the frontend's own RULES, not measurements: the passenger rank at which a rider
    // report counts against the line (a mirror of the backend enum's position rather than an
    // invented threshold), the report count that corroborates one (a pure rule, since the backend
    // already scopes the window), and the service-day shapes the three history widgets draw — the
    // hour the day starts, how many buckets it has, and how many steps the heat grid's intensity
    // ladder has. Those three are mirrors rather than thresholds: they describe the SHAPE the backend
    // already returns, and their purpose is that a widget's label and this page's sentence cannot
    // drift apart. `network-summary.util.spec.ts`, `status-confidence.util.spec.ts` and
    // `status-history-display.util.spec.ts` each pin their code against the same numbers.
    expect(Object.keys(METHODOLOGY_CONSTANTS)).toEqual([
      "STALE_REVIEW_MONTHS",
      "NEEDS_ATTENTION_PASSENGER_RANK",
      "CONFIRMED_MIN_REPORTS",
      "SERVICE_DAY_START_HOUR",
      "SERVICE_DAY_HOURS",
      "HEAT_INTENSITY_STEPS",
      "REPORT_RANKING_TOP_LINES",
      "REPORT_OUTBOX_FALLBACK_WINDOW_MINUTES",
      "PLANNED_WORKS_WINDOW_DAYS",
      "LINE_NOTICE_MAX_CHIPS",
      "STATION_INCIDENT_HISTORY_LIMIT",
      "STATION_REPORTS_PER_LINE",
      "PUSH_ALERT_COOLDOWN_MINUTES",
    ]);
    expect(METHODOLOGY_CONSTANTS["NEEDS_ATTENTION_PASSENGER_RANK"]).toEqual({
      value: 5,
      source: "LINE_STATUS_DERIVE.md",
    });
    expect(METHODOLOGY_CONSTANTS["CONFIRMED_MIN_REPORTS"]).toEqual({
      value: 3,
      source: "LINE_STATUS_DERIVE.md",
    });
    expect(METHODOLOGY_CONSTANTS["SERVICE_DAY_START_HOUR"]).toEqual({
      value: 3,
      source: "LINE_STATUS_DERIVE.md",
    });
    expect(METHODOLOGY_CONSTANTS["SERVICE_DAY_HOURS"]).toEqual({
      value: 24,
      source: "LINE_STATUS_DERIVE.md",
    });
    expect(METHODOLOGY_CONSTANTS["HEAT_INTENSITY_STEPS"]).toEqual({
      value: 5,
      source: "LINE_STATUS_DERIVE.md",
    });
    // The Pro worst-lines ranking's cap: a display limit rather than a measurement, published only
    // because the ranking's own sentence names it. `pro-report-ranking.component.spec.ts` pins this
    // value against the constant the widget slices with.
    expect(METHODOLOGY_CONSTANTS["REPORT_RANKING_TOP_LINES"]).toEqual({
      value: 5,
      source: "LINE_STATUS_DERIVE.md",
    });
    // How long a report queued while offline may wait when the page did not know its line's
    // window: a frontend fallback (the line's own window is the backend's, recorded per report).
    // `report-outbox.service.spec.ts` pins this value against the constant the outbox falls back to.
    expect(METHODOLOGY_CONSTANTS["REPORT_OUTBOX_FALLBACK_WINDOW_MINUTES"]).toEqual({
      value: 15,
      source: "LINE_STATUS_DERIVE.md",
    });
    // The board's Notice / Planned works chips: the window the planned-works read sends (the backend
    // counts the days) and the display cap per line, published because the chips' popover names both.
    // `home.queries.spec.ts` pins the window against the variable it is sent as, and
    // `incident-notices.util.spec.ts` pins the cap against the constant `pickLineChips` slices with.
    expect(METHODOLOGY_CONSTANTS["PLANNED_WORKS_WINDOW_DAYS"]).toEqual({
      value: 7,
      source: "INCIDENT_EPISODES.md",
    });
    expect(METHODOLOGY_CONSTANTS["LINE_NOTICE_MAX_CHIPS"]).toEqual({
      value: 2,
      source: "INCIDENT_EPISODES.md",
    });
    // The station page: how many other incidents its Recent list shows, and how many of each serving
    // line's newest reports it searches for the station. Both are caps this client chooses, published
    // because the page's popovers name them. `station.page.spec.ts` pins each against the constant in
    // `station.queries.ts` that the page slices or requests with.
    expect(METHODOLOGY_CONSTANTS["STATION_INCIDENT_HISTORY_LIMIT"]).toEqual({
      value: 10,
      source: "INCIDENT_EPISODES.md",
    });
    expect(METHODOLOGY_CONSTANTS["STATION_REPORTS_PER_LINE"]).toEqual({
      value: 10,
      source: "LINE_STATUS_DERIVE.md",
    });
    // The line alerts' per-line cooldown: a mirror of the backend's COOLDOWN_SECONDS (1800) that no
    // client code applies, so this assertion is the only pin. Change both when the backend changes.
    expect(METHODOLOGY_CONSTANTS["PUSH_ALERT_COOLDOWN_MINUTES"]).toEqual({
      value: 30,
      source: "PUSH_NOTIFICATIONS.md",
    });
  });

  it("throws on an unknown token instead of leaving it in the output", () => {
    expect(() => renderMethodologyCopy("{{NOT_A_REAL_TOKEN}}")).toThrow(/NOT_A_REAL_TOKEN/);
  });

  it("leaves no unresolved token after rendering a known template", () => {
    expect(renderMethodologyCopy("Stale after {{STALE_REVIEW_MONTHS}} months.")).not.toContain(
      "{{",
    );
  });
});

describe("methodology render util: metricDoc", () => {
  it("returns a real registry entry", () => {
    expect(metricDoc("line-status.active").sectionId).toBe("line-status");
  });

  it("throws on an unknown metric id", () => {
    expect(() => metricDoc("line-status.nope")).toThrow(/line-status\.nope/);
  });

  it("leaves no unresolved token in a rendered metric definition", () => {
    expect(renderMethodologyCopy(metricDoc("line-status.active").definition)).not.toContain("{{");
  });
});

describe("methodology render util: metricTooltip", () => {
  it("renders the token-resolved SUMMARY when the metric has one", () => {
    const doc = metricDoc("network.lines-normal");
    expect(doc.summary).toBeDefined();
    expect(metricTooltip("network.lines-normal")).toBe(renderMethodologyCopy(doc.summary ?? ""));
    // Not just "a real string" — it must be the shorter tier, not the full definition.
    expect(metricTooltip("network.lines-normal")).not.toBe(renderMethodologyCopy(doc.definition));
  });

  it("resolves a token inside a summary, not just a token-free one", () => {
    expect(metricTooltip("network.needs-attention")).toContain(
      String(METHODOLOGY_CONSTANTS["NEEDS_ATTENTION_PASSENGER_RANK"].value),
    );
  });

  it("falls back to the full DEFINITION when the metric has no summary", () => {
    expect(metricDoc("line-status.active").summary).toBeUndefined();
    expect(metricTooltip("line-status.active")).toBe(
      renderMethodologyCopy(metricDoc("line-status.active").definition),
    );
  });

  it("throws on an unknown metric id, like metricDoc", () => {
    expect(() => metricTooltip("network.nope")).toThrow(/network\.nope/);
  });
});

describe("methodology render util: section", () => {
  it("returns a real registry entry", () => {
    expect(section("line-status").id).toBe("line-status");
  });

  it("throws on an unknown section id", () => {
    expect(() => section("not-a-section")).toThrow(/not-a-section/);
  });

  it("leaves no unresolved token in a rendered section body", () => {
    expect(renderMethodologyCopy(section("line-status").body)).not.toContain("{{");
  });
});
