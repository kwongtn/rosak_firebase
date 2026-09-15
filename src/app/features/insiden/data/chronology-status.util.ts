/** Visible labels for chronology statuses that carry an approval tag. LIVE and DRAFT stay
 * untagged (no tag entry), and unknown/absent statuses map to null so callers render nothing.
 * Both the stored TextChoices value (lowercase: `pending_approval`/`pending_deletion`) and the
 * GraphQL enum name (SCREAMING_SNAKE: `PENDING_APPROVAL`/`PENDING_DELETION`) are covered, so it
 * keeps working whatever casing the backend sends — same dual-casing pattern as the
 * incident-status util. Task 17 reuses this map for the console pending-deletion rows. */
const CHRONOLOGY_STATUS_LABELS: Record<string, string> = {
  PENDING_APPROVAL: "Pending Approval",
  pending_approval: "Pending Approval",
  PENDING_DELETION: "Pending Deletion",
  pending_deletion: "Pending Deletion",
};

/** Tag label for a chronology status, or null when the row needs no tag (LIVE, DRAFT, missing
 * status, or a status this frontend doesn't know yet). */
export function chronologyStatusLabel(status: string | undefined): string | null {
  if (!status) {
    return null;
  }
  return CHRONOLOGY_STATUS_LABELS[status] ?? null;
}

/**
 * May this chronology still be flagged for deletion? LIVE rows (either casing) and rows whose
 * status the backend hasn't sent yet — the backend stays the authoritative gate, so an absent
 * status is treated as requestable rather than hiding the affordance. PENDING_APPROVAL/DRAFT
 * rows are excluded: they go through the direct-delete flow instead (Task 6 delete_chronology),
 * and PENDING_DELETION is already flagged. Both casings covered (dual-casing contract).
 */
export function isChronologyDeletionRequestable(status: string | undefined): boolean {
  return !status || status.toUpperCase() === "LIVE";
}

/** Is this chronology in the pending-deletion state (either casing)? Console queue rows render
 * their approve/reject deletion actions from this. */
export function isChronologyPendingDeletion(status: string | undefined): boolean {
  return status?.toUpperCase() === "PENDING_DELETION";
}
