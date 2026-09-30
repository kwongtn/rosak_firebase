import { formatDate } from "@angular/common";

import { FeedLink } from "./home.queries";

export interface FeedDayGroup {
  key: string;
  label: string;
  links: FeedLink[];
}

/** LOCAL calendar-day key (YYYY-MM-DD) of a parsed date. Local — not UTC like
 * `insiden/link-day-group.util` — because the home feed's `created` values are naive
 * Asia/Kuala_Lumpur datetimes (backend `USE_TZ=False`), so their local fields already carry the
 * MY calendar day. */
function localDayKey(date: Date): string {
  const pad2 = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Whole calendar days between `date`'s local midnight and `now`'s local midnight. */
function calendarDaysAgo(date: Date, now: Date): number {
  const from = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((to - from) / 86_400_000);
}

function dayLabel(date: Date, now: Date): string {
  const days = calendarDaysAgo(date, now);
  if (days === 0) {
    return "Today";
  }
  if (days === 1) {
    return "Yesterday";
  }
  return formatDate(date, "EEE, d MMM", "en-US");
}

/**
 * Groups links (already created-DESC from the backend) into local calendar-day buckets. A day's
 * links merge into one group even when interleaved, preserving first-encounter (newest-first)
 * order; a day with no links never appears. Labels: "Today" / "Yesterday" / `EEE, d MMM`.
 *
 * Pure and deterministic — the caller supplies `now` (defaults to the real clock) so specs and
 * SSR both pin the reference day.
 */
export function groupFeedLinksByDay(links: FeedLink[], now: Date = new Date()): FeedDayGroup[] {
  const groups: FeedDayGroup[] = [];
  const byKey = new Map<string, FeedDayGroup>();
  for (const link of links) {
    const date = new Date(link.created);
    const valid = !Number.isNaN(date.getTime());
    const key = valid ? localDayKey(date) : "";
    let group = byKey.get(key);
    if (!group) {
      group = { key, label: valid ? dayLabel(date, now) : "", links: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.links.push(link);
  }
  return groups;
}
