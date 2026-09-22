import { describe, expect, it } from "vitest";

import { feedDomainOf, feedUrlPartsOf } from "./feed-link.util";

describe("feedDomainOf", () => {
  it("returns the hostname with a leading www. stripped", () => {
    expect(feedDomainOf("https://www.example.com/story")).toBe("example.com");
  });

  it("keeps subdomains and bare hosts intact", () => {
    expect(feedDomainOf("https://news.bbc.co.uk/article")).toBe("news.bbc.co.uk");
    expect(feedDomainOf("https://x.com/prasarana/status/1")).toBe("x.com");
  });

  it("falls back to the raw url when no hostname can be extracted", () => {
    expect(feedDomainOf("not a url")).toBe("not a url");
    expect(feedDomainOf("mailto:someone@example.com")).toBe("mailto:someone@example.com");
    expect(feedDomainOf("")).toBe("");
  });
});

describe("feedUrlPartsOf", () => {
  it("splits a www host into a stripped domain plus its path", () => {
    expect(feedUrlPartsOf("https://www.example.com/story")).toEqual({
      domain: "example.com",
      restPath: "/story",
    });
  });

  it("returns the same domain as feedDomainOf for the same url", () => {
    for (const url of [
      "https://www.example.com/story",
      "https://news.bbc.co.uk/article?ref=home",
      "https://x.com/prasarana/status/1",
      "not a url",
      "",
    ]) {
      expect(feedUrlPartsOf(url).domain).toBe(feedDomainOf(url));
    }
  });

  it("returns an empty path for a bare host with or without a trailing slash", () => {
    expect(feedUrlPartsOf("https://www.example.com")).toEqual({
      domain: "example.com",
      restPath: "",
    });
    expect(feedUrlPartsOf("https://www.example.com/")).toEqual({
      domain: "example.com",
      restPath: "",
    });
  });

  it("keeps a path-only url's path", () => {
    expect(feedUrlPartsOf("https://example.com/r/posts/123")).toEqual({
      domain: "example.com",
      restPath: "/r/posts/123",
    });
  });

  it("keeps the query and hash with the path", () => {
    expect(feedUrlPartsOf("https://example.com/r/posts/123?src=rss#top")).toEqual({
      domain: "example.com",
      restPath: "/r/posts/123?src=rss#top",
    });
  });

  it("falls back to the raw url as the domain and drops the path when unparseable", () => {
    expect(feedUrlPartsOf("not a url")).toEqual({ domain: "not a url", restPath: "" });
    expect(feedUrlPartsOf("mailto:someone@example.com")).toEqual({
      domain: "mailto:someone@example.com",
      restPath: "",
    });
    expect(feedUrlPartsOf(undefined)).toEqual({ domain: "", restPath: "" });
  });
});
