import { describe, expect, it } from "vitest";
import { linkStatusInput } from "./link-status-input.util";
import type { SocialMediaLinkRow } from "./insiden-console.queries";

function makeLink(overrides: Partial<SocialMediaLinkRow> = {}): SocialMediaLinkRow {
  return {
    id: "1",
    url: "https://x.com/prasarana/status/1",
    title: "Service alert",
    created: "2026-09-01T09:00:00",
    occurredAt: "2026-08-31T22:15:00",
    threadId: null,
    isThreadRoot: true,
    threadSize: 1,
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
      occurredAt: "2026-08-31T22:15:00",
      status: "HIDDEN",
    });
  });

  it("round-trips occurredAt verbatim — never as null", () => {
    // `occurredAt` is tri-state on the backend: omitted = unchanged, a value =
    // set, explicit null = RESET to the row's created. `SocialMediaLinkInput` is
    // replace-not-patch, so an Approve/Hide click that coerced a missing event
    // time to null would silently rewrite the row's event time — and re-sort the
    // public feed with it. Guarded here because the coercion is one `??` away.
    expect(linkStatusInput(makeLink(), "LIVE").occurredAt).toBe("2026-08-31T22:15:00");
    expect(linkStatusInput(makeLink(), "HIDDEN").occurredAt).not.toBeNull();
  });

  it("keeps the naive wall-time string exactly as the row carried it", () => {
    // No offset to add, no UTC to convert to: the backend runs USE_TZ = False.
    const input = linkStatusInput(makeLink({ occurredAt: "2026-08-31T22:15:00" }), "LIVE");
    expect(input.occurredAt).toBe("2026-08-31T22:15:00");
    expect(input.occurredAt).not.toContain("Z");
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
