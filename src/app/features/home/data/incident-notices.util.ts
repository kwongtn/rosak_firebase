import { formatDate } from "@angular/common";

import type { BadgeVariants } from "../../../ui/badge/badge";
import type { HomeIncidentItem, HomeIncidentSeverity } from "./home-incidents.queries";

/**
 * The most chips ONE line shows on the board, Notices before Planned works. The rest collapse into a
 * "+N" link to the incident calendar. A published number (`LINE_NOTICE_MAX_CHIPS` in the methodology
 * registry): this util's spec pins the two together so the popover cannot name another cap.
 */
export const MAX_LINE_CHIPS = 2;

/**
 * Groups incidents by the lines they are tagged with: `lines[].id` → the incidents on that line.
 *
 * One incident may tag several lines and then sits in every one of those lists (the same object, not
 * a copy). Each list keeps the INPUT order, so the caller's `order` argument decides what "first"
 * means: the ongoing read asks `startDatetime DESC` (newest first), the planned-works read
 * `startDatetime ASC` (soonest first). This function never re-sorts, because one fixed direction
 * would be wrong for one of the two. An incident with no lines is on no list: a network-wide notice
 * has no row to sit on.
 */
export function groupIncidentsByLine(
  incidents: readonly HomeIncidentItem[],
): Map<string, HomeIncidentItem[]> {
  const byLine = new Map<string, HomeIncidentItem[]>();
  for (const incident of incidents) {
    for (const line of incident.lines) {
      const list = byLine.get(line.id);
      if (!list) {
        byLine.set(line.id, [incident]);
      } else if (list[list.length - 1] !== incident) {
        // A line listed twice on one incident would otherwise push it twice (the pushes are
        // consecutive, so comparing with the last entry is enough).
        list.push(incident);
      }
    }
  }
  return byLine;
}

/** One chip to draw on a line: a Notice (running now) or a Planned works (starting soon). */
export interface LineChip {
  kind: "notice" | "planned";
  incident: HomeIncidentItem;
}

/**
 * Picks the chips one line shows: its Notices first, then its Planned works, the first `max` of them
 * in that order, and how many more there are (`more`, which the board links to `/insiden`).
 *
 * `more` counts everything NOT drawn, so "+N" is exact however long either list is. An incident that
 * is in both lists (it started between the two reads, which are separate requests that answer at
 * different moments) is drawn once, as the Notice: it is running now, and "planned" would be out of
 * date.
 */
export function pickLineChips(
  notices: readonly HomeIncidentItem[],
  planned: readonly HomeIncidentItem[],
  max: number = MAX_LINE_CHIPS,
): { chips: LineChip[]; more: number } {
  const noticeIds = new Set(notices.map((incident) => incident.id));
  const all: LineChip[] = [
    ...notices.map((incident): LineChip => ({ kind: "notice", incident })),
    ...planned
      .filter((incident) => !noticeIds.has(incident.id))
      .map((incident): LineChip => ({ kind: "planned", incident })),
  ];
  return { chips: all.slice(0, max), more: Math.max(0, all.length - max) };
}

/** `YYYY-MM-DD` at the front of the backend's offset-free datetime (`2026-10-25T08:30:00`). */
const START_DAY = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/;

/**
 * The calendar day a backend datetime names, as a UTC-midnight `Date` that exists only to hold that
 * day, or `null` for anything that is not a real date.
 *
 * The backend stores wall-clock Kuala Lumpur time with no offset (`USE_TZ = False`). The day is read
 * from the STRING and never from `new Date(string)`: an offset-free string parses as the machine's
 * local time, so the same datetime could land on different days on the server and in the browser, and
 * a link built from it would differ between the server render and the hydrated page.
 */
function dayOf(startDatetime: string): Date | null {
  const match = START_DAY.exec(startDatetime);
  if (!match) {
    return null;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  // `Date.UTC` rolls 31 February over into March (and maps years 0-99 onto 19xx); the round trip
  // rejects both instead of linking to a different day.
  const real =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return real ? date : null;
}

/** The `/insiden/<date>` segment for an incident that starts at `startDatetime`, or `null`. */
export function incidentDayKey(startDatetime: string): string | null {
  return dayOf(startDatetime) ? startDatetime.slice(0, 10) : null;
}

/** The start day as the board writes a day (`Sat 25 Oct`), or `null` for an unreadable datetime.
 *  `formatDate` with an explicit locale and `UTC`, so neither the ICU build nor the machine's
 *  timezone can change the text. */
export function incidentDayLabel(startDatetime: string): string | null {
  const date = dayOf(startDatetime);
  return date ? formatDate(date, "EEE d MMM", "en-US", "UTC") : null;
}

/** Severity → badge variant, the pairing `/insiden` cards and the Pro widget already use (red / amber /
 *  neutral). Exhaustive over the enum, so a new severity fails to compile here instead of rendering an
 *  unstyled chip. */
const SEVERITY_VARIANT: Record<HomeIncidentSeverity, BadgeVariants["variant"]> = {
  MAJOR: "destructive",
  MINOR: "warning",
  OTHERS: "neutral",
};

const SEVERITY_LABEL: Record<HomeIncidentSeverity, string> = {
  MAJOR: "Major",
  MINOR: "Minor",
  OTHERS: "Other",
};

/** The badge variant for a severity; a value the enum does not know yet reads as neutral. */
export function incidentSeverityVariant(severity: HomeIncidentSeverity): BadgeVariants["variant"] {
  return SEVERITY_VARIANT[severity] ?? "neutral";
}

/** The plain-language severity (`Major` / `Minor` / `Other`); the word, so colour is never the only
 *  channel. */
export function incidentSeverityLabel(severity: HomeIncidentSeverity): string {
  return SEVERITY_LABEL[severity] ?? "Other";
}
