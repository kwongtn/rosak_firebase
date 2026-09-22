/**
 * "X Years Y Months Z Days ago" — calendar-accurate (not a flat /365 or /30 division), and only
 * as granular as needed: a leading zero unit is dropped (e.g. "5 Days ago" with no "0 Months").
 *
 * Anything under a day is measured from the real elapsed time instead of calendar days, so a live
 * feed reads "5 minutes ago" / "3 hours ago" rather than "today". A future timestamp (clock skew)
 * or an unparseable one clamps to the freshest string — never a negative or NaN age.
 */
export function humanizeSince(iso: string): string {
  const past = new Date(iso);
  const now = new Date();
  const elapsedMs = now.getTime() - past.getTime();

  if (!Number.isFinite(elapsedMs) || elapsedMs < 60_000) {
    return "less than a minute ago";
  }

  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  const hours = Math.floor(elapsedMs / 3_600_000);
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  let years = now.getFullYear() - past.getFullYear();
  let months = now.getMonth() - past.getMonth();
  let days = now.getDate() - past.getDate();

  if (days < 0) {
    months -= 1;
    days += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const parts: string[] = [];
  if (years > 0) parts.push(`${years} Year${years === 1 ? "" : "s"}`);
  if (months > 0) parts.push(`${months} Month${months === 1 ? "" : "s"}`);
  if (days > 0) parts.push(`${days} Day${days === 1 ? "" : "s"}`);

  return `${parts.join(" ")} ago`;
}
