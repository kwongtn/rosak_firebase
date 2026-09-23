import { splitHttpUrl } from "./incident-link-line.util";

/** One link row's URL as the shared card displays it on a single line: `domain` in the normal
 * foreground colour, `restPath` in muted grey. */
interface LinkUrlParts {
  /** Hostname with a leading `www.` stripped, so "https://www.example.com/story" reads as
   * "example.com". Falls back to the raw URL when no hostname can be extracted (unparseable URL
   * or non-http(s) scheme). */
  domain: string;
  /** Path/query/hash after the host ("/story", "/story?x=1#top"). Empty for a bare host or when
   * the URL can't be parsed. */
  restPath: string;
}

/**
 * Splits a link URL for display (moved here from the deleted home feed util so the insiden data
 * layer owns URL presentation and no feature imports from `features/home`). Host parsing reuses
 * the shared `splitHttpUrl` — the same domain/remainder split the insiden incident link line
 * draws — so the two surfaces can't drift.
 */
export function linkUrlPartsOf(url: string | undefined | null): LinkUrlParts {
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
