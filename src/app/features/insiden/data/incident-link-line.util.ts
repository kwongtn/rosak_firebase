import { faviconHostnameOf } from "./social-link.util";

/** One incident link row as drawn on the card (spec F7/F8/F9): the line is
 * `[yyyy-mm-dd hh:mm] [favicon] [title]`, where "title" is the provided title,
 * or the URL — domain bold, remainder paler, single-line truncated. */
export interface IncidentLinkLine {
  /** Local-time "yyyy-mm-dd hh:mm" label from `created` (no DatePipe inside
   * this util — pure and unit-testable). Empty string when `created` is
   * missing/invalid. Local time matches the card's own DatePipe rendering
   * (`MMM d, y HH:mm` — DatePipe's default timezone is the browser's). */
  datetimeLabel: string;
  /** Google S2 favicon URL (`...?domain=<host>&sz=32`), or "" when the host can't
   * be extracted — the row then falls back to a plain link icon. */
  faviconUrl: string;
  /** Bold lead of the line — the URL hostname, or `null` when a title is
   * provided (the whole title renders as the line text) or the URL is invalid. */
  domain: string | null;
  /** Paler remainder of the line — the URL's path/query/hash after the host.
   * Always "" when `domain` is null. */
  restPath: string;
  /** The line's text: `title` when provided/non-empty, otherwise the URL. */
  displayText: string;
  /** The link URL — the `href` of the whole-line hyperlink. */
  url: string;
  /** True for user-submitted links awaiting admin approval (backend
   * `SocialMediaLinkStatus.PENDING_APPROVAL` — both enums casings treated
   * identically, same dual-casing contract as CalendarIncidentStatus). */
  isPending: boolean;
}

export interface IncidentLinkRow {
  url: string;
  title?: string | null;
  created?: string | null;
  status?: string | null;
}

const S2_FAVICON_BASE = "https://www.google.com/s2/favicons?domain=";

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function toLocalDateTimeLabel(created: string | undefined | null): string {
  if (!created) {
    return "";
  }
  const date = new Date(created);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  const hh = pad2(date.getHours());
  const mm = pad2(date.getMinutes());
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

/** Thin wrapper around `new URL` — null-safe, never throws. */
function parseHttpUrl(url: string | undefined | null): URL | null {
  const host = faviconHostnameOf(url);
  if (!host) {
    return null;
  }
  try {
    return new URL(url ?? "");
  } catch {
    return null;
  }
}

function restPathOf(parsed: URL | null): string {
  if (!parsed) {
    return "";
  }
  return parsed.pathname + parsed.search + parsed.hash;
}

const isPendingApproval = (status: string | undefined | null): boolean =>
  status?.toUpperCase() === "PENDING_APPROVAL";

export function incidentLinkLine(input: IncidentLinkRow): IncidentLinkLine {
  const url = input.url ?? "";
  const title = input.title?.trim();
  const hasTitle = Boolean(title);
  const parsed = hasTitle ? null : parseHttpUrl(url);
  const host = hasTitle ? faviconHostnameOf(url) : (parsed?.hostname ?? null);
  const domain = parsed?.hostname ?? null;

  return {
    datetimeLabel: toLocalDateTimeLabel(input.created),
    faviconUrl: host ? `${S2_FAVICON_BASE}${host}&sz=32` : "",
    domain,
    restPath: restPathOf(parsed),
    displayText: hasTitle ? (title ?? "") : url,
    url,
    isPending: isPendingApproval(input.status),
  };
}
