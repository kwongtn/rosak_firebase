import { describe, expect, it } from "vitest";
import { isPendingLink, linkStatusLabel, linkStatusVariant } from "./my-links-status.util";

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

  it("maps HIDDEN (wire enum) and the raw stored lowercase hidden to Hidden", () => {
    expect(linkStatusLabel({ status: "HIDDEN", completed: false })).toBe("Hidden");
    expect(linkStatusLabel({ status: "hidden", completed: true })).toBe("Hidden");
  });
});

describe("linkStatusVariant", () => {
  it("chips a pending row as a warning, a hidden row as neutral, a live row as default", () => {
    expect(linkStatusVariant({ status: "PENDING_APPROVAL", completed: false })).toBe("warning");
    // Hidden must not borrow Live's solid chip, or a moderated row reads as published.
    expect(linkStatusVariant({ status: "HIDDEN", completed: false })).toBe("neutral");
    expect(linkStatusVariant({ status: "LIVE", completed: false })).toBe("default");
  });

  it("falls back to the completed flag for a legacy row with no status", () => {
    expect(linkStatusVariant({ status: undefined, completed: false })).toBe("warning");
    expect(linkStatusVariant({ status: undefined, completed: true })).toBe("default");
  });
});

describe("isPendingLink", () => {
  it("is true only for pending links", () => {
    expect(isPendingLink({ status: "PENDING_APPROVAL", completed: false })).toBe(true);
    expect(isPendingLink({ status: "LIVE", completed: true })).toBe(false);
    // A hidden row is not awaiting approval — it was approved, then moderated away.
    expect(isPendingLink({ status: "HIDDEN", completed: false })).toBe(false);
  });
});
