const PENDING_STATUSES = new Set(["PENDING_APPROVAL", "DRAFT"]);

/** True when an incident still needs admin approval before it surfaces as LIVE. Accepts both the
 * stored TextChoices value (lowercase: `pending_approval`/`draft`) and the GraphQL enum name
 * (SCREAMING_SNAKE: `PENDING_APPROVAL`/`DRAFT`) so it keeps working whatever the backend sends.
 * Missing/blank status → not pending: the graceful fallback for backends that don't expose the
 * field yet (the tag simply stays hidden instead of the card misbehaving). */
export function isPendingIncidentStatus(status: string | undefined): boolean {
  const normalized = status?.toUpperCase();
  return normalized !== undefined && PENDING_STATUSES.has(normalized);
}

/**
 * True only for an approved incident: `LIVE` in either casing.
 *
 * Deliberately NOT the complement of {@link isPendingIncidentStatus}. That helper degrades a missing
 * status to "not pending" so a card still renders against an older backend; a COUNT that said
 * "approved" about a row nobody approved (a draft, a rejected report, a payload with no status at
 * all) would be a claim with no evidence behind it, so here a missing status is not live.
 */
export function isLiveIncidentStatus(status: string | null | undefined): boolean {
  return status?.toUpperCase() === "LIVE";
}
