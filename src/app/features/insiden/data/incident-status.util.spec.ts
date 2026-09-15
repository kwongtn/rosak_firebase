import { isPendingIncidentStatus } from "./incident-status.util";

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
