import { describe, expect, it } from "vitest";
import { linkStatusInput } from "./link-status-input.util";
import type { SocialMediaLinkRow } from "./insiden-console.queries";

function makeLink(overrides: Partial<SocialMediaLinkRow> = {}): SocialMediaLinkRow {
  return {
    id: "1",
    url: "https://x.com/prasarana/status/1",
    title: "Service alert",
    created: "2026-09-01T09:00:00Z",
    completed: false,
    completedAt: null,
    completedBy: null,
    status: "LIVE",
    isAutomated: false,
    user: { nickname: "Zul", shortId: "abcd1234" },
    lines: [{ id: "l1", code: "KJL", displayName: "Kelana Jaya Line" }],
    vehicles: [{ id: "v1", identificationNo: "V-123" }],
    stations: [{ id: "s1", displayName: "KL Sentral" }],
    categories: [{ id: "c1", name: "Disruption" }],
    ...overrides,
  };
}

describe("linkStatusInput", () => {
  it("re-sends every scalar and tag id next to the requested status", () => {
    expect(linkStatusInput(makeLink(), "HIDDEN")).toEqual({
      url: "https://x.com/prasarana/status/1",
      title: "Service alert",
      lineIds: ["l1"],
      vehicleIds: ["v1"],
      stationIds: ["s1"],
      categoryIds: ["c1"],
      status: "HIDDEN",
    });
  });

  it("carries the LIVE status for the publish verb", () => {
    expect(linkStatusInput(makeLink(), "LIVE").status).toBe("LIVE");
  });

  it("sends a null title (not an omitted key) for a blank row and empty id lists", () => {
    // The backend assigns title and .set()s the M2M relations unconditionally, so
    // "blank" and "unchanged" must be expressed the same way for every status change.
    const input = linkStatusInput(
      makeLink({ title: "", lines: [], vehicles: [], stations: [], categories: [] }),
      "HIDDEN",
    );
    expect(input.title).toBeNull();
    expect(input.lineIds).toEqual([]);
    expect(input.vehicleIds).toEqual([]);
    expect(input.stationIds).toEqual([]);
    expect(input.categoryIds).toEqual([]);
  });

  it("ignores the row's own status — the caller's target status wins", () => {
    expect(linkStatusInput(makeLink({ status: "HIDDEN" }), "LIVE").status).toBe("LIVE");
  });
});
