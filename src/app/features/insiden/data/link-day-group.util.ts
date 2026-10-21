import { klDateKey } from "../../../core/time/kl-date";

/**
 * The instant every surface DISPLAYS for a link: `occurredAt` ("when did this happen"),
 * falling back to `created` ("when was it reported"). One rule, so a day header can never
 * name a different day than the timestamp on the card under it.
 *
 * The `?? created` is load-bearing, not defensive noise, and it stays even though every document
 * now requests `occurredAt` (including the nested per-incident `links` sub-select in
 * `insiden.queries.ts`). The reason it is optional on the SHARED structural type is that the type
 * is satisfied by every document, host and spec fixture that hands a link to a card — a type whose
 * "required" field list had to be re-derived per document would push that knowledge into every
 * call site. `strictNullChecks` is OFF in this project, so nothing would flag a dropped fallback:
 * it would silently yield an `Invalid Date` (i.e. the "" headerless bucket) instead.
 *
 * ⚠️ The fallback is therefore NOT an invitation to stop selecting `occurredAt`. The nested
 * per-incident `links` sub-select is the case that bit this feature: the card's continuation pages
 * (`publicSocialMediaLinks(incidentId, …)`) select it and the nested first page did not, so the
 * one list labelled its top 10 rows by submission time and every row below it by event time.
 * Deduplicating that nested selection as "redundant with the root query" reintroduces exactly
 * that split; the same argument is recorded at the selection itself.
 */
export function linkDisplayInstant(link: { created: string; occurredAt?: string | null }): string {
  return link.occurredAt ?? link.created;
}

/** A time part that ends in `Z` or `±hh[:mm]` — a real instant rather than a wall-clock string.
 * Tested on the slice after the date so the date's own `-dd` can never read as an offset. */
const HAS_OFFSET = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/;

/** An ISO `YYYY-MM-DDT…` string: only these carry the day in their first ten characters. */
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T/;

/** Asia/Kuala_Lumpur calendar-day key (YYYY-MM-DD) of a link timestamp; "" when unparseable.
 * The backend sends NAIVE Kuala Lumpur wall times ("2026-09-28T15:46:46", `USE_TZ = False`), whose
 * first ten characters already ARE the Malaysian day — so those are sliced, never run through
 * `new Date()` + UTC getters, which read them in the viewer's zone (UTC on the SSR server, +8 in a
 * Malaysian browser) and moved the day between SSR and hydration. A string that does carry an
 * offset is a true instant and is shifted to Kuala Lumpur (fixed UTC+8) first. Either way the key
 * is the same in every zone, which is what keeps SSR and the browser in agreement. Any other string
 * `Date.parse` accepts ("Sep 28, 2026 15:46") takes the parse path: its first ten characters are not
 * a date, and a non-`YYYY-MM-DD` key would make the header's DatePipe throw.
 *
 * WHICH instant gets bucketed is `linkDisplayInstant(link)` (the event time); the frame is
 * independent of that choice. */
export function linkDateKey(instantIso: string): string {
  const ms = Date.parse(instantIso);
  if (Number.isNaN(ms)) {
    return "";
  }
  const naive = ISO_DATE_TIME.test(instantIso) && !HAS_OFFSET.test(instantIso.slice(10));
  return naive ? instantIso.slice(0, 10) : klDateKey(ms);
}

/** "Today"/"Yesterday" label for a day key, or "" for any older day (the template then formats
 * the key as a UTC-midnight date). `todayKey` is the caller's `klDateKey()`; "yesterday" is
 * derived from it purely arithmetically on the date-only value. */
export function linkDayLabel(dateKey: string, todayKey: string): "Today" | "Yesterday" | "" {
  if (dateKey === todayKey) {
    return "Today";
  }
  const yesterday = new Date(`${todayKey}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return dateKey === yesterday.toISOString().slice(0, 10) ? "Yesterday" : "";
}

interface LinkDayGroup<T> {
  /** Asia/Kuala_Lumpur YYYY-MM-DD ("" for unparseable dates — rendered headerless). */
  key: string;
  label: "Today" | "Yesterday" | "";
  items: T[];
}

/** Groups links (already `occurredAt DESC, id DESC` from the backend) into day buckets
 * preserving order. Consecutive same-day links collapse into one group; a day with no items
 * never appears. Links with an unparseable date land in a "" group without a header.
 *
 * Buckets key on `linkDisplayInstant(link)` — the EVENT time — so a header always agrees with
 * both the timestamp the row's card prints and the order the rows arrived in. Keying on
 * `created` could split one calendar day across two headers the moment a rider back-dates a
 * report (submitted this morning, about last night's disruption), and could order the headers
 * themselves out of step with a feed that is sorted on the other instant. */
export function groupLinksByDay<T extends { created: string; occurredAt?: string | null }>(
  links: T[],
  todayKey: string,
): LinkDayGroup<T>[] {
  const groups: LinkDayGroup<T>[] = [];
  for (const link of links) {
    const key = linkDateKey(linkDisplayInstant(link));
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(link);
    } else {
      groups.push({ key, label: linkDayLabel(key, todayKey), items: [link] });
    }
  }
  return groups;
}
