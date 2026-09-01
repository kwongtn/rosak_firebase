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
