/** Read-model needed to decide the link Edit affordance. Deliberately plain values so the
 * util stays pure and unit-testable — callers wire signals to it. */
export interface CanEditLinkContext {
  isLoggedIn: boolean;
  isAdmin: boolean;
  /** Full Firebase uid of the signed-in user (the util derives the 8-char prefix itself so
   * callers never have to know about the backend's shortId scheme). */
  userId: string | null;
}

/** Author identity as carried by the public link payload (`user: UserScalar`, null for
 * legacy rows). Loose on purpose — the util must stay decisive when the payload lacks it. */
type LinkPayload = {
  user?: { shortId: string } | null;
};

/**
 * Should the link card's Edit affordance be visible?
 *
 * Mirrors the backend gate in `update_social_media_link` (incident/services/social_links.py):
 * admin may edit any link; a submitter edits only their own (8-char shortId prefix match
 * against `user.shortId`). The backend stays the authoritative gate either way — a stray
 * button is a cosmetic over-permission, never a real one.
 */
export function canEditLink(link: LinkPayload, context: CanEditLinkContext): boolean {
  if (!context.isLoggedIn) {
    return false;
  }
  if (context.isAdmin) {
    return true;
  }
  return (
    link.user?.shortId !== undefined &&
    context.userId !== null &&
    context.userId.slice(0, 8) === link.user.shortId
  );
}
