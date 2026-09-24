import { describe, expect, it } from "vitest";

import { METHODOLOGY_CONSTANTS } from "./methodology.constants";
import { metricDoc, renderMethodologyCopy, section } from "./methodology-render.util";

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
    expect(Object.keys(METHODOLOGY_CONSTANTS)).toEqual(["STALE_REVIEW_MONTHS"]);
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
