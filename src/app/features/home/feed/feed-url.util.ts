/** RFC 3986 scheme prefix (`mailto:`, `ftp://`, `HTTPS:`…). Note the captured scheme may contain
 * dots, which is exactly why host:port input needs the extra check below. */
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

/**
 * Scheme-qualifies what the user typed into the feed's submit box, so the backend only ever
 * receives an absolute URL. The input is deliberately `type="text"` (native url validation would
 * silently block `example.com/x`), which makes this the one place the shape is fixed up.
 *
 * - trims surrounding whitespace;
 * - leaves an existing `http://` / `https://` scheme untouched, case-insensitively;
 * - prefixes `https://` when no scheme is present — including protocol-relative `//host`;
 * - leaves other schemes (`mailto:`, `ftp://`) as-is: the backend canonicalizes or rejects them,
 *   and rewriting them here would corrupt the user's intent;
 * - an empty/whitespace-only value stays empty so the form's existing `required` validator is
 *   what reports it.
 *
 * `example.com:8080/x` parses as RFC scheme "example.com", but a dot before the colon means
 * host:port, not a real scheme — only scheme candidates without a dot are left untouched.
 */
export function normalizeFeedUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return "";
  }
  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }
  const scheme = SCHEME.exec(trimmed)?.[1];
  return scheme && !scheme.includes(".") ? trimmed : `https://${trimmed}`;
}
