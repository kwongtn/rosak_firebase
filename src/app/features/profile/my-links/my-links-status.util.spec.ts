import { describe, expect, it } from "vitest";
import { isPendingLink, linkStatusLabel } from "./my-links-status.util";

describe("linkStatusLabel", () => {
  it("maps PENDING_APPROVAL (wire enum) to Pending approval", () => {
    expect(linkStatusLabel({ status: "PENDING_APPROVAL", completed: false })).toBe(
      "Pending approval",
    );
  });

  it("maps the raw stored lowercase pending_approval too", () => {
    expect(linkStatusLabel({ status: "pending_approval", completed: false })).toBe(
      "Pending approval",
    );
  });

  it("maps LIVE to Live", () => {
    expect(linkStatusLabel({ status: "LIVE", completed: true })).toBe("Live");
  });

  it("falls back to completed=false when status is absent (legacy row)", () => {
    expect(linkStatusLabel({ status: null, completed: false })).toBe("Pending approval");
  });

  it("falls back to completed=true when status is absent (legacy row)", () => {
    expect(linkStatusLabel({ status: undefined, completed: true })).toBe("Live");
  });

  it("defaults unknown statuses to Live", () => {
    expect(linkStatusLabel({ status: "REJECTED", completed: false })).toBe("Live");
  });
});

describe("isPendingLink", () => {
  it("is true only for pending links", () => {
    expect(isPendingLink({ status: "PENDING_APPROVAL", completed: false })).toBe(true);
    expect(isPendingLink({ status: "LIVE", completed: true })).toBe(false);
  });
});
