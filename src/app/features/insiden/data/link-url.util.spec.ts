import { describe, expect, it } from "vitest";

import { linkUrlPartsOf } from "./link-url.util";

describe("linkUrlPartsOf", () => {
  it("returns the hostname with a leading www. stripped", () => {
    expect(linkUrlPartsOf("https://www.example.com/story")).toEqual({
      domain: "example.com",
      restPath: "/story",
    });
  });

  it("keeps subdomains and bare hosts intact", () => {
    expect(linkUrlPartsOf("https://news.bbc.co.uk/article")).toEqual({
      domain: "news.bbc.co.uk",
      restPath: "/article",
    });
    expect(linkUrlPartsOf("https://x.com/prasarana/status/1")).toEqual({
      domain: "x.com",
      restPath: "/prasarana/status/1",
    });
  });

  it("returns an empty path for a bare host with or without a trailing slash", () => {
    expect(linkUrlPartsOf("https://www.example.com")).toEqual({
      domain: "example.com",
      restPath: "",
    });
    expect(linkUrlPartsOf("https://www.example.com/")).toEqual({
      domain: "example.com",
      restPath: "",
    });
  });

  it("keeps a path-only url's path", () => {
    expect(linkUrlPartsOf("https://example.com/r/posts/123")).toEqual({
      domain: "example.com",
      restPath: "/r/posts/123",
    });
  });

  it("keeps the query and hash with the path", () => {
    expect(linkUrlPartsOf("https://example.com/r/posts/123?src=rss#top")).toEqual({
      domain: "example.com",
      restPath: "/r/posts/123?src=rss#top",
    });
  });

  it("falls back to the raw url as the domain and drops the path when unparseable", () => {
    expect(linkUrlPartsOf("not a url")).toEqual({ domain: "not a url", restPath: "" });
    expect(linkUrlPartsOf("mailto:someone@example.com")).toEqual({
      domain: "mailto:someone@example.com",
      restPath: "",
    });
    expect(linkUrlPartsOf(undefined)).toEqual({ domain: "", restPath: "" });
    expect(linkUrlPartsOf("")).toEqual({ domain: "", restPath: "" });
  });
});
