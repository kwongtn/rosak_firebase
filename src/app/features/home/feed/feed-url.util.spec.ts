import { describe, expect, it } from "vitest";

import { normalizeFeedUrl } from "./feed-url.util";

describe("normalizeFeedUrl", () => {
  it.each([
    ["plain domain", "example.com", "https://example.com"],
    ["path and query", "example.com/x?q=1", "https://example.com/x?q=1"],
    ["www host", "www.example.com", "https://www.example.com"],
    ["subdomain", "news.bbc.co.uk/article", "https://news.bbc.co.uk/article"],
    ["protocol-relative", "//example.com", "https://example.com"],
    ["protocol-relative with path", "//example.com/x?q=1", "https://example.com/x?q=1"],
    ["existing https", "https://example.com/x", "https://example.com/x"],
    ["existing http", "http://example.com/x", "http://example.com/x"],
    ["uppercase scheme", "HTTPS://Example.com/X", "HTTPS://Example.com/X"],
    ["surrounding whitespace", "  example.com/x  ", "https://example.com/x"],
    ["whitespace around scheme", "  https://example.com/x  ", "https://example.com/x"],
    ["non-http scheme", "mailto:someone@example.com", "mailto:someone@example.com"],
    ["ftp scheme", "ftp://files.example.com/x", "ftp://files.example.com/x"],
    ["host with port still gets a scheme", "example.com:8080/x", "https://example.com:8080/x"],
    [
      "path, query and fragment",
      "example.com/a/b?x=1&y=2#top",
      "https://example.com/a/b?x=1&y=2#top",
    ],
    ["empty string", "", ""],
    ["whitespace only", "   ", ""],
  ])("normalizes %s", (_label, raw, expected) => {
    expect(normalizeFeedUrl(raw)).toBe(expected);
  });
});
