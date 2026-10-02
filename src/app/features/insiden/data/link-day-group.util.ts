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

/** UTC calendar-day key (YYYY-MM-DD) of an ISO instant; "" when unparseable.
 * UTC, not local: SSR renders on the server (UTC in App Hosting) while the browser is in
 * the viewer's timezone — local-day grouping would differ between the two and break
 * hydration. Matches the incident calendar's UTC day anchor.
 *
 * WHICH instant gets bucketed changed (`created` → `linkDisplayInstant(link)`); the UTC frame
 * above deliberately did NOT change with it. The hydration argument for UTC holds for either
 * field, and moving the frame would relocate every existing viewer's day headers for a
 * consistency gain the field swap already provides on its own. */
export function linkDateKey(instantIso: string): string {
  const date = new Date(instantIso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const pad2 = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/** "Today"/"Yesterday" label for a day key, or "" for any older day (the template then
 * formats the key itself via DatePipe with the UTC zone). `todayKey` is the caller's
 * `linkDateKey()` of now; "yesterday" is derived from it purely arithmetically. */
export function linkDayLabel(dateKey: string, todayKey: string): "Today" | "Yesterday" | "" {
  if (dateKey === todayKey) {
    return "Today";
  }
  const yesterday = new Date(`${todayKey}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return dateKey === linkDateKey(yesterday.toISOString()) ? "Yesterday" : "";
}

interface LinkDayGroup<T> {
  /** UTC YYYY-MM-DD ("" for unparseable dates — rendered headerless). */
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
