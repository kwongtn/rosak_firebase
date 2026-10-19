import { describe, expect, it } from "vitest";
import { HOME_CACHE_CONTROL, homeCacheControl } from "./server-cache-control";

describe("homeCacheControl", () => {
  it("stamps the home policy on a 200 GET of /", () => {
    expect(homeCacheControl("GET", "/", 200, null)).toBe(HOME_CACHE_CONTROL);
  });

  it("uses the exact 20s / 60s window the home page is cached for", () => {
    expect(HOME_CACHE_CONTROL).toBe("public, s-maxage=20, stale-while-revalidate=60");
  });

  it("does not override a Cache-Control the response already set", () => {
    expect(homeCacheControl("GET", "/", 200, "no-store")).toBeNull();
  });

  it.each([
    ["a non-200 status", "GET", "/", 404],
    ["a redirect", "GET", "/", 301],
    ["a server error", "GET", "/", 500],
  ])("leaves %s alone", (_label, method, path, status) => {
    expect(homeCacheControl(method, path, status, null)).toBeNull();
  });

  it.each([
    ["a POST", "POST", "/"],
    ["a HEAD", "HEAD", "/"],
  ])("leaves %s to the default policy", (_label, method, path) => {
    expect(homeCacheControl(method, path, 200, null)).toBeNull();
  });

  it.each([["/spotting"], ["/console"], ["/?"], ["//"], ["/index.html"]])(
    "only the exact path / is cached, not %s",
    (path) => {
      expect(homeCacheControl("GET", path, 200, null)).toBeNull();
    },
  );
});
