import { isLiveIncidentStatus, isPendingIncidentStatus } from "./incident-status.util";

describe("isPendingIncidentStatus", () => {
  it("returns true for the GraphQL enum casing", () => {
    expect(isPendingIncidentStatus("PENDING_APPROVAL")).toBe(true);
    expect(isPendingIncidentStatus("DRAFT")).toBe(true);
  });

  it("returns true for the stored TextChoices (lowercase) casing", () => {
    expect(isPendingIncidentStatus("pending_approval")).toBe(true);
    expect(isPendingIncidentStatus("draft")).toBe(true);
  });

  it("returns false for live and rejected incidents", () => {
    expect(isPendingIncidentStatus("LIVE")).toBe(false);
    expect(isPendingIncidentStatus("live")).toBe(false);
    expect(isPendingIncidentStatus("REJECTED")).toBe(false);
    expect(isPendingIncidentStatus("rejected")).toBe(false);
  });

  it("returns false when status is missing or blank (graceful fallback)", () => {
    expect(isPendingIncidentStatus(undefined)).toBe(false);
    expect(isPendingIncidentStatus("")).toBe(false);
  });
});

describe("isLiveIncidentStatus", () => {
  it("is true for live in either casing", () => {
    expect(isLiveIncidentStatus("LIVE")).toBe(true);
    expect(isLiveIncidentStatus("live")).toBe(true);
  });

  it("is false for every other lifecycle state", () => {
    expect(isLiveIncidentStatus("DRAFT")).toBe(false);
    expect(isLiveIncidentStatus("PENDING_APPROVAL")).toBe(false);
    expect(isLiveIncidentStatus("rejected")).toBe(false);
  });

  it("is false when the status is missing, unlike isPendingIncidentStatus's graceful fallback", () => {
    expect(isLiveIncidentStatus(undefined)).toBe(false);
    expect(isLiveIncidentStatus(null)).toBe(false);
    expect(isLiveIncidentStatus("")).toBe(false);
  });
});
