/**
 * Hostname of a submitted social-media link URL, for the Google favicon lookup
 * (`https://www.google.com/s2/favicons?domain=<hostname>`). Returns `null` when the URL is
 * missing/unparseable or carries a non-http(s) scheme — the caller then falls back to a plain
 * link icon instead of rendering a broken favicon image.
 */
export function faviconHostnameOf(url: string | undefined | null): string | null {
  if (!url) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return null;
  }
  return parsed.hostname;
}
