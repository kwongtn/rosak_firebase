import { faviconHostnameOf } from "./social-link.util";

/** One incident link row as drawn on the card (spec F7/F8/F9): the line is
 * `[yyyy-mm-dd hh:mm] [favicon] [title]`, where "title" is the provided title,
 * or the URL — domain bold, remainder paler, single-line truncated. */
interface IncidentLinkLine {
  /** Local-time "yyyy-mm-dd hh:mm" label from the DISPLAYED instant —
   * `occurredAt ?? created`, the same rule `app-link-card` applies (no DatePipe inside
   * this util — pure and unit-testable). Empty string when the instant is
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

interface IncidentLinkRow {
  url: string;
  title?: string | null;
  /** "When someone reported it" — moderation provenance, and the DISPLAYED instant only when
   * `occurredAt` is absent. Optional here because the row type is deliberately loose (spec
   * fixtures and the "gracefully degrades" cases omit it entirely). */
  created?: string | null;
  /** "When it happened" — the event instant and, since the ordering migration, the column every
   * link list sorts on. OPTIONAL because it is selected per GraphQL document and this row type is
   * deliberately loose (the "gracefully degrades" cases omit it) — NOT because any document is
   * known to skip it: every link selection requests it today, the nested per-incident `links`
   * sub-select included. An absent value therefore means a row/payload that predates the column,
   * which is what the `?? created` fallback in `incidentLinkLine` is for. */
  occurredAt?: string | null;
  status?: string | null;
}

const S2_FAVICON_BASE = "https://www.google.com/s2/favicons?domain=";

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Formats an ISO instant as local "yyyy-mm-dd hh:mm"; "" for a missing/unparseable value.
 *
 * `new Date(...)` + local getters is the SSR-safe way to do this: the backend runs
 * `USE_TZ = False` with `TIME_ZONE = Asia/Kuala_Lumpur`, so the timestamp string is naive local
 * wall time. Do NOT "normalize" it through `toISOString()` or UTC field getters — that converts
 * to UTC and shifts the value by 8 hours. */
export function toLocalDateTimeLabel(instant: string | undefined | null): string {
  if (!instant) {
    return "";
  }
  const date = new Date(instant);
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

/** Shared host + remainder split for a URL: the parsed http(s) hostname together with
 * everything after it (`pathname + search + hash`). Returns `null` when the URL is
 * missing/unparseable or carries a non-http(s) scheme. Used by `incidentLinkLine`
 * (domain bold, remainder paler) and by the home feed card's one-line URL display. */
export function splitHttpUrl(
  url: string | undefined | null,
): { domain: string; restPath: string } | null {
  const parsed = parseHttpUrl(url);
  if (!parsed) {
    return null;
  }
  return { domain: parsed.hostname, restPath: restPathOf(parsed) };
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
    // The EVENT time, so the inline line agrees with the card's own timestamp and with the
    // `-occurred_at, -id` order these rows arrive in. `?? created` covers a row that carries no
    // event time at all — legacy rows, an older cached payload — which is a data case, not a query
    // gap: every link document selects `occurredAt` today.
    datetimeLabel: toLocalDateTimeLabel(input.occurredAt ?? input.created),
    faviconUrl: host ? `${S2_FAVICON_BASE}${host}&sz=32` : "",
    domain,
    restPath: restPathOf(parsed),
    displayText: hasTitle ? (title ?? "") : url,
    url,
    isPending: isPendingApproval(input.status),
  };
}
