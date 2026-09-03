import { isPendingIncidentStatus } from "./incident-status.util";
/** Read-model needed to decide edit affordance. Deliberately plain values so the util stays
 * pure and unit-testable — callers wire signals to it. */
export interface CanEditIncidentContext {
  isLoggedIn: boolean;
  isAdmin: boolean;
  /** Full Firebase uid of the signed-in user (the util derives the 8-char prefix itself so
   * callers never have to know about the backend's shortId scheme). */
  userId: string | null;
}

/** Author identity as carried by the payload: the backend exposes `user: UserScalar` (created_by;
 * null for legacy rows) with the public `shortId` (= firebase_id[:8], see
 * common/schema/scalars.py UserScalar.short_id). Status is deliberately loose — the payload can
 * carry either casing or a value outside the known enum, and the util must stay decisive. */
type AuthorPayload = {
  status?: string;
  user?: { shortId: string } | null;
};

/**
 * Should the card's Edit affordance be visible?
 *
 * Mirrors the backend's `may_edit` (incident/access.py: admin-or-author, LIVE allowed) while
 * staying strict where the payload is ambiguous, because the backend stays the authoritative
 * gate either way — a stray button is a cosmetic over-permission, never a real one:
 * - logged out → false (the create/edit sheet does not send auth headers — see graphql-client)
 * - LIVE → true (any logged-in user)
 * - pending (DRAFT / PENDING_APPROVAL, either casing) → admin, or author (8-char shortId prefix
 *   match against `user.shortId`)
 * - REJECTED → same as pending (author may revise)
 * - missing/unknown status → admin only (conservative: no author info to prove ownership with)
 */
export function canEditIncident(incident: AuthorPayload, context: CanEditIncidentContext): boolean {
  if (!context.isLoggedIn) {
    return false;
  }

  const status = incident.status?.toUpperCase();
  if (status === "LIVE") {
    return true;
  }

  const authorMatches =
    incident.user?.shortId !== undefined &&
    context.userId !== null &&
    context.userId.slice(0, 8) === incident.user.shortId;

  const authorOrAdmin = context.isAdmin || authorMatches;
  if (isPendingIncidentStatus(incident.status)) {
    return authorOrAdmin;
  }
  if (status === "REJECTED") {
    return authorOrAdmin;
  }

  // Missing/unknown status → admin only (conservative).
  return context.isAdmin;
}
