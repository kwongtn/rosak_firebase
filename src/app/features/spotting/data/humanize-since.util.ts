/**
 * "X Years Y Months Z Days ago" — calendar-accurate (not a flat /365 or /30 division), and only
 * as granular as needed: a leading zero unit is dropped (e.g. "5 Days ago" with no "0 Months").
 */
export function humanizeSince(iso: string): string {
  const past = new Date(iso);
  const now = new Date();

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

  if (years <= 0 && months <= 0 && days <= 0) {
    return "today";
  }

  const parts: string[] = [];
  if (years > 0) parts.push(`${years} Year${years === 1 ? "" : "s"}`);
  if (months > 0) parts.push(`${months} Month${months === 1 ? "" : "s"}`);
  if (days > 0) parts.push(`${days} Day${days === 1 ? "" : "s"}`);

  return `${parts.join(" ")} ago`;
}
