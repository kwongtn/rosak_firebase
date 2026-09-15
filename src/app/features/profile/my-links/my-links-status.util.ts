export type LinkStatusLabel = "Pending approval" | "Live";

export interface LinkStatusSource {
  status?: string | null;
  completed: boolean;
}

/** Task 23 status badge label. The wire enum is SCREAMING_SNAKE ("PENDING_APPROVAL"/"LIVE"),
 * but older payloads can carry the raw stored value ("pending_approval") or nothing at all
 * (pre-Task-10 rows) — in that case the `completed` console flag is the fallback truth. */
export function linkStatusLabel(link: LinkStatusSource): LinkStatusLabel {
  const normalized = link.status?.toUpperCase();
  if (normalized === "PENDING_APPROVAL" || (normalized === undefined && !link.completed)) {
    return "Pending approval";
  }
  return "Live";
}

export function isPendingLink(link: LinkStatusSource): boolean {
  return linkStatusLabel(link) === "Pending approval";
}
