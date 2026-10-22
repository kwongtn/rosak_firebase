import { describe, expect, it } from "vitest";
import { HOME_CACHE_CONTROL, homeCacheControl, staticCacheControl } from "./server-cache-control";

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

describe("staticCacheControl", () => {
  it.each([
    ["ngsw.json"],
    ["ngsw-worker.js"],
    ["safety-worker.js"],
    ["worker-basic.min.js"],
    ["firebase-messaging-sw.js"],
    ["manifest.webmanifest"],
    ["icons/icon-192.png"],
    ["icons/apple-touch-icon.png"],
    ["index.csr.html"],
    ["version.json"],
  ])("revalidates %s, whose name survives a deploy", (path) => {
    expect(staticCacheControl(path)).toBe("no-cache");
  });

  it.each([["main-NMF5H2WK.js"], ["chunk-D4-DL31Z2.js"], ["styles-XBTPHFWG.css"], ["media/x.png"]])(
    "leaves the one-year max-age on %s",
    (path) => {
      expect(staticCacheControl(path)).toBeNull();
    },
  );

  it("matches whole paths only", () => {
    expect(staticCacheControl("chunk-ngsw.json")).toBeNull();
    expect(staticCacheControl("icons/nested/icon.png")).toBeNull();
  });
});
