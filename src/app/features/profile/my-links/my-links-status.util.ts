type LinkStatusLabel = "Pending approval" | "Live" | "Hidden";

/** Chip variant for the same three states. `HIDDEN` gets the muted `neutral` chip so a
 *  moderated-away submission is never mistaken for a published one (both would otherwise
 *  share the solid `default` chip). */
type LinkStatusVariant = "warning" | "default" | "neutral";

interface LinkStatusSource {
  status?: string | null;
  completed: boolean;
}

/** Status badge label. The wire enum is SCREAMING_SNAKE ("PENDING_APPROVAL"/"LIVE"/"HIDDEN"),
 * but older payloads can carry the raw stored value ("pending_approval"/"hidden") or nothing at
 * all (pre-Task-10 rows) — in that case the `completed` console flag is the fallback truth. */
export function linkStatusLabel(link: LinkStatusSource): LinkStatusLabel {
  const normalized = link.status?.toUpperCase();
  if (normalized === "HIDDEN") {
    return "Hidden";
  }
  if (normalized === "PENDING_APPROVAL" || (normalized === undefined && !link.completed)) {
    return "Pending approval";
  }
  return "Live";
}

export function isPendingLink(link: LinkStatusSource): boolean {
  return linkStatusLabel(link) === "Pending approval";
}

export function linkStatusVariant(link: LinkStatusSource): LinkStatusVariant {
  if (link.status?.toUpperCase() === "HIDDEN") {
    return "neutral";
  }
  return isPendingLink(link) ? "warning" : "default";
}
