import {
  chronologyStatusLabel,
  isChronologyDeletionRequestable,
  isChronologyPendingDeletion,
} from "./chronology-status.util";

describe("chronologyStatusLabel", () => {
  it("labels the GraphQL enum casing", () => {
    expect(chronologyStatusLabel("PENDING_APPROVAL")).toBe("Pending Approval");
    expect(chronologyStatusLabel("PENDING_DELETION")).toBe("Pending Deletion");
  });

  it("labels the stored TextChoices (lowercase) casing", () => {
    expect(chronologyStatusLabel("pending_approval")).toBe("Pending Approval");
    expect(chronologyStatusLabel("pending_deletion")).toBe("Pending Deletion");
  });

  it("returns null for live and draft statuses (untagged)", () => {
    expect(chronologyStatusLabel("LIVE")).toBeNull();
    expect(chronologyStatusLabel("live")).toBeNull();
    expect(chronologyStatusLabel("DRAFT")).toBeNull();
    expect(chronologyStatusLabel("draft")).toBeNull();
  });

  it("returns null for missing, blank, or unknown statuses (graceful fallback)", () => {
    expect(chronologyStatusLabel(undefined)).toBeNull();
    expect(chronologyStatusLabel("")).toBeNull();
    expect(chronologyStatusLabel("REJECTED")).toBeNull();
  });
});

describe("isChronologyDeletionRequestable", () => {
  it("is requestable for LIVE rows in both casings and for absent status", () => {
    expect(isChronologyDeletionRequestable("LIVE")).toBe(true);
    expect(isChronologyDeletionRequestable("live")).toBe(true);
    expect(isChronologyDeletionRequestable(undefined)).toBe(true);
  });

  it("is not requestable for draft/pending approval, already-flagged, or unknown rows", () => {
    expect(isChronologyDeletionRequestable("DRAFT")).toBe(false);
    expect(isChronologyDeletionRequestable("PENDING_APPROVAL")).toBe(false);
    expect(isChronologyDeletionRequestable("PENDING_DELETION")).toBe(false);
    expect(isChronologyDeletionRequestable("pending_deletion")).toBe(false);
  });
});

describe("isChronologyPendingDeletion", () => {
  it("matches the pending-deletion state in both casings", () => {
    expect(isChronologyPendingDeletion("PENDING_DELETION")).toBe(true);
    expect(isChronologyPendingDeletion("pending_deletion")).toBe(true);
  });

  it("rejects every other status (including missing)", () => {
    expect(isChronologyPendingDeletion("LIVE")).toBe(false);
    expect(isChronologyPendingDeletion("PENDING_APPROVAL")).toBe(false);
    expect(isChronologyPendingDeletion(undefined)).toBe(false);
  });
});
