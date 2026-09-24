import { UrlSegment, UrlSegmentGroup } from "@angular/router";
import { describe, expect, it } from "vitest";

import { routes } from "../../app.routes";
import { METHODOLOGY_SECTIONS, METRIC_DOCS } from "./methodology.content";
import { renderMethodologyCopy } from "./methodology-render.util";

/** The dependency-map spec filenames a `sourceSpec` may name (METHODOLOGY_DOCS.md map). */
const DEPENDENCY_SPECS = new Set([
  "MONTHLY_REVIEW.md",
  "INCIDENT_EPISODES.md",
  "NEXT_TRAIN_ARRIVALS.md",
  "DATA_PROVENANCE.md",
  "OFFICIAL_POST_INGESTION.md",
  "LINE_STATUS_DERIVE.md",
  "DATA_EXPORT.md",
  "PUSH_NOTIFICATIONS.md",
  "PLATFORM_HYGIENE.md",
  "METHODOLOGY_DOCS.md",
]);

const ALL_ENTRIES = [...METHODOLOGY_SECTIONS, ...METRIC_DOCS];

/** ISO yyyy-mm-dd for the local day, so a date equal to today is not "in the future". */
function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function segmentsFor(ownerRoute: string): UrlSegment[] {
  return ownerRoute
    .split("/")
    .filter((part) => part !== "")
    .map((path) => new UrlSegment(path, {}));
}

/**
 * A non-null `ownerRoute` must resolve in `app.routes.ts`: either a literal `path` entry
 * (e.g. `/tracker`, `/console`) or a matcher route (e.g. `/insiden`, `/gallery`, which declare
 * a matcher instead of a `path`).
 */
function ownerRouteResolves(ownerRoute: string): boolean {
  const segments = segmentsFor(ownerRoute);
  const literal = "/" + segments.map((segment) => segment.path).join("/");
  const group = new UrlSegmentGroup(segments, {});
  return routes.some((route) => {
    if (typeof route.path === "string") {
      return "/" + route.path === literal;
    }
    return route.matcher ? route.matcher(segments, group, route) !== null : false;
  });
}

describe("methodology registry drift", () => {
  it("has unique section ids", () => {
    const ids = METHODOLOGY_SECTIONS.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique metric ids", () => {
    const ids = METRIC_DOCS.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("points every metric at an existing section", () => {
    const sectionIds = new Set(METHODOLOGY_SECTIONS.map((entry) => entry.id));
    for (const metric of METRIC_DOCS) {
      expect(sectionIds.has(metric.sectionId), metric.id).toBe(true);
    }
  });

  it("resolves every non-null ownerRoute against app.routes.ts", () => {
    for (const entry of ALL_ENTRIES) {
      if (entry.ownerRoute !== null) {
        expect(ownerRouteResolves(entry.ownerRoute), `${entry.id} → ${entry.ownerRoute}`).toBe(
          true,
        );
      }
    }
  });

  it("names only dependency-map specs, each ending in .md", () => {
    for (const entry of ALL_ENTRIES) {
      expect(entry.sourceSpec.endsWith(".md"), entry.id).toBe(true);
      expect(DEPENDENCY_SPECS.has(entry.sourceSpec), `${entry.id} → ${entry.sourceSpec}`).toBe(
        true,
      );
    }
  });

  it("has a parseable, non-future lastReviewed on every entry", () => {
    const today = todayIso();
    for (const entry of ALL_ENTRIES) {
      expect(entry.lastReviewed, entry.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(new Date(entry.lastReviewed).getTime()), entry.id).toBe(false);
      expect(entry.lastReviewed <= today, `${entry.id} lastReviewed is in the future`).toBe(true);
    }
  });

  it("keeps every section non-empty: inProgress, or owning at least one metric", () => {
    for (const section of METHODOLOGY_SECTIONS) {
      const owned = METRIC_DOCS.filter((metric) => metric.sectionId === section.id);
      expect(section.inProgress || owned.length > 0, section.id).toBe(true);
    }
  });

  it("ships the eight sections, each still in progress until its code lands", () => {
    expect(METHODOLOGY_SECTIONS.map((entry) => entry.id)).toEqual([
      "sources",
      "reliability",
      "episodes",
      "line-status",
      "sightings",
      "arrivals",
      "moderation",
      "limitations",
    ]);
    for (const section of METHODOLOGY_SECTIONS) {
      expect(section.inProgress, section.id).toBe(true);
    }
  });

  it("documents the two metric groups that exist today", () => {
    expect(METRIC_DOCS.length).toBeGreaterThan(0);
    expect(
      METRIC_DOCS.filter((metric) => metric.sectionId === "line-status").length,
    ).toBeGreaterThan(0);
    expect(METRIC_DOCS.filter((metric) => metric.sectionId === "sightings").length).toBeGreaterThan(
      0,
    );
  });

  it("renders every section body with no unresolved token", () => {
    for (const section of METHODOLOGY_SECTIONS) {
      expect(renderMethodologyCopy(section.body), section.id).not.toContain("{{");
    }
  });

  it("renders every metric definition with no unresolved token", () => {
    for (const metric of METRIC_DOCS) {
      expect(renderMethodologyCopy(metric.definition), metric.id).not.toContain("{{");
    }
  });

  it("never carries a license or attribution string in the registry", () => {
    const serialized = JSON.stringify({ sections: METHODOLOGY_SECTIONS, metrics: METRIC_DOCS });
    expect(serialized).not.toMatch(/CC[- ]?BY|ODbL|OpenStreetMap|data\.gov\.my/i);
  });
});
