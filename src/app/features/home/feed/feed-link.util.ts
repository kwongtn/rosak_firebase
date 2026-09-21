import { faviconHostnameOf } from "../../insiden/data/social-link.util";

/**
 * Domain headline for a feed row: the URL's hostname with a leading `www.` stripped, so
 * "https://www.example.com/story" reads as "example.com". Falls back to the raw URL when no
 * hostname can be extracted (unparseable URL or non-http(s) scheme), mirroring the insiden link
 * card. Reuses `faviconHostnameOf` for the URL/scheme parsing rather than duplicating it.
 */
export function feedDomainOf(url: string | undefined | null): string {
  const hostname = faviconHostnameOf(url);
  if (!hostname) {
    return url ?? "";
  }
  return hostname.replace(/^www\./, "");
}
