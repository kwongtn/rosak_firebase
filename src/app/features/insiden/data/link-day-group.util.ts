/** UTC calendar-day key (YYYY-MM-DD) of an ISO created timestamp; "" when unparseable.
 * UTC, not local: SSR renders on the server (UTC in App Hosting) while the browser is in
 * the viewer's timezone — local-day grouping would differ between the two and break
 * hydration. Matches the incident calendar's UTC day anchor. */
export function linkDateKey(createdIso: string): string {
  const date = new Date(createdIso);
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

/** Groups links (already created-DESC from the backend) into day buckets preserving order.
 * Consecutive same-day links collapse into one group; a day with no items never appears.
 * Links with an unparseable date land in a "" group without a header. */
export function groupLinksByDay<T extends { created: string }>(
  links: T[],
  todayKey: string,
): LinkDayGroup<T>[] {
  const groups: LinkDayGroup<T>[] = [];
  for (const link of links) {
    const key = linkDateKey(link.created);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(link);
    } else {
      groups.push({ key, label: linkDayLabel(key, todayKey), items: [link] });
    }
  }
  return groups;
}
