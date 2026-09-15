import type { CalendarIncidentHistoryEntry } from "./insiden.queries";

/** Backend model field name (django-simple-history `diff_against`) → readable label
 * for the "— changed: …" tail of the history line. Unknown fields fall back to the
 * raw name with underscores as spaces (`rejection_reason` → "rejection reason") so
 * the line never shows machine-speak. Kept tiny: only the fields users actually edit. */
const CHANGED_FIELD_LABELS: Record<string, string> = {
  start_datetime: "start time",
  end_datetime: "end time",
  long_term: "long-term",
  inaccurate: "accuracy flag",
  impact_factor: "impact",
  title: "title",
  brief: "brief",
  details: "details",
  severity: "severity",
  status: "approval status",
  rejection_reason: "rejection reason",
  medias: "photos",
  version: "version",
};

export function incidentHistoryChangedLabel(field: string): string {
  return CHANGED_FIELD_LABELS[field] ?? field.replaceAll("_", " ");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `MMM d, y HH:mm` in local time — the same label the card renders its other
 * datetimes with (`| date: "MMM d, y HH:mm"`), pinned here so this pure util is
 * testable without Angular's DatePipe. Empty string for a missing/invalid stamp. */
export function incidentHistoryDatetimeLabel(timestamp: string): string {
  const date = new Date(timestamp);
  if (!timestamp || Number.isNaN(date.getTime())) {
    return "";
  }
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()} ${hh}:${mm}`;
}

/**
 * Single-line summary of one history entry (Task 18: the card shows the latest
 * entry only). Null actor renders as "system" (backend contract: no history_user
 * ⇒ null). The card's historyLine computed additionally hides "deleted" records.
 */
export function incidentHistoryLine(entry: CalendarIncidentHistoryEntry): string {
  const actor = entry.actor ?? "system";
  const datetime = incidentHistoryDatetimeLabel(entry.timestamp);
  switch (entry.changeType) {
    case "created":
      return `Created ${datetime} by ${actor}`;
    case "updated": {
      const changed = entry.changedFields.map(incidentHistoryChangedLabel);
      const tail = changed.length > 0 ? ` — changed: ${changed.join(", ")}` : "";
      return `Last updated ${datetime} by ${actor}${tail}`;
    }
    case "deleted":
      return `Deleted ${datetime} by ${actor}`;
  }
}
