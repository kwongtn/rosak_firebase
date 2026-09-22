import { splitHttpUrl } from "../../insiden/data/incident-link-line.util";

/** One feed row's URL as the card displays it on a single line: `domain` in the normal
 * foreground colour, `restPath` in muted grey. */
export interface FeedUrlParts {
  /** Hostname with a leading `www.` stripped, so "https://www.example.com/story" reads as
   * "example.com". Falls back to the raw URL when no hostname can be extracted (unparseable
   * URL or non-http(s) scheme). */
  domain: string;
  /** Path/query/hash after the host ("/story", "/story?x=1#top"). Empty for a bare host or
   * when the URL can't be parsed. */
  restPath: string;
}

/**
 * Splits a feed URL for display. Host parsing reuses the shared `splitHttpUrl` (the same
 * domain/remainder split the insiden link line draws), so the two surfaces can't drift.
 * `www.` stripping matches `feedDomainOf`, which now delegates here.
 */
export function feedUrlPartsOf(url: string | undefined | null): FeedUrlParts {
  const split = splitHttpUrl(url);
  if (!split) {
    return { domain: url ?? "", restPath: "" };
  }
  // A bare trailing "/" is not a path worth showing in grey.
  return {
    domain: split.domain.replace(/^www\./, ""),
    restPath: split.restPath === "/" ? "" : split.restPath,
  };
}

/**
 * Domain headline for a feed row: the URL's hostname with a leading `www.` stripped, so
 * "https://www.example.com/story" reads as "example.com". Falls back to the raw URL when no
 * hostname can be extracted (unparseable URL or non-http(s) scheme), mirroring the insiden link
 * card.
 */
export function feedDomainOf(url: string | undefined | null): string {
  return feedUrlPartsOf(url).domain;
}
