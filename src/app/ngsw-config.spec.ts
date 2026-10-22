import { Generator, type Config, type Filesystem } from "@angular/service-worker/config";
import { describe, expect, it } from "vitest";

import ngswConfig from "../../ngsw-config.json";

/** The slice of the generated ngsw.json these rules are about. */
interface NgswManifest {
  index: string;
  assetGroups: { name: string; installMode: string; urls: string[] }[];
  dataGroups: unknown[];
  navigationUrls: { positive: boolean; regex: string }[];
  navigationRequestStrategy: string;
}

/** A production build's browser output, reduced to one file of each kind. */
const BUILD_OUTPUT = [
  "/index.csr.html",
  "/main-ABC123.js",
  "/main-ABC123.js.map",
  "/chunk-DEF456.js",
  "/styles-GHI789.css",
  "/firebase-messaging-sw.js",
  "/version.json",
  "/manifest.webmanifest",
  "/robots.txt",
  "/favicon.svg",
  "/icons/icon-192.png",
];

/** Only `list` and `hash` matter to the generator; nothing is read or written. */
const buildOutput: Filesystem = {
  list: async () => BUILD_OUTPUT,
  read: async () => "",
  hash: async (file) => `hash:${file}`,
  write: async () => undefined,
};

/** Runs the same generator `ng build` uses to turn ngsw-config.json into ngsw.json. */
async function generateManifest(): Promise<NgswManifest> {
  const manifest: unknown = await new Generator(buildOutput, "/").process(ngswConfig as Config);
  return manifest as NgswManifest;
}

/** The worker's own test (ngsw-worker.js `isNavigationRequest`) for a navigation's path. */
function isNavigationUrl(manifest: NgswManifest, path: string): boolean {
  const matches = (positive: boolean): boolean =>
    manifest.navigationUrls
      .filter((pattern) => pattern.positive === positive)
      .some((pattern) => new RegExp(pattern.regex).test(path));
  return matches(true) && !matches(false);
}

describe("ngsw-config.json", () => {
  it("prefetches the CSR shell and the hashed JS and CSS, without source maps", async () => {
    const { assetGroups } = await generateManifest();

    expect(assetGroups.find((group) => group.name === "app")).toMatchObject({
      installMode: "prefetch",
      urls: ["/chunk-DEF456.js", "/index.csr.html", "/main-ABC123.js", "/styles-GHI789.css"],
    });
  });

  it("never caches the Firebase Cloud Messaging worker, which the browser fetches itself", async () => {
    const { assetGroups } = await generateManifest();

    expect(assetGroups.flatMap((group) => group.urls)).not.toContain("/firebase-messaging-sw.js");
  });

  it("caches images only lazily, on first use", async () => {
    const { assetGroups } = await generateManifest();

    expect(assetGroups.find((group) => group.name === "media")).toMatchObject({
      installMode: "lazy",
      urls: ["/favicon.svg", "/icons/icon-192.png"],
    });
  });

  it("caches no HTML but the CSR shell, and no /version.json, manifest or source maps", async () => {
    const { assetGroups, dataGroups } = await generateManifest();
    const cached = assetGroups.flatMap((group) => group.urls);

    expect(cached.filter((url) => /\.(html|json|webmanifest|map|txt)$/.test(url))).toEqual([
      "/index.csr.html",
    ]);
    // GraphQL reads are POSTs, which ngsw never caches, so a data group would only add work.
    expect(dataGroups).toEqual([]);
  });

  it("asks the network first for every navigation, so SSR still answers each route", async () => {
    const manifest = await generateManifest();

    expect(manifest.navigationRequestStrategy).toBe("freshness");
    expect(
      ["/", "/insiden/2026-10-21", "/spotting/1/vehicle/2"].map((path) =>
        isNavigationUrl(manifest, path),
      ),
    ).toEqual([true, true, true]);
    // Files and Firebase's /__/auth/ helper pages are never navigations to the app.
    expect(
      ["/main-ABC123.js", "/version.json", "/__/auth/handler"].map((path) =>
        isNavigationUrl(manifest, path),
      ),
    ).toEqual([false, false, false]);
  });

  it("falls back to the precached CSR shell when a navigation cannot reach the network", async () => {
    const manifest = await generateManifest();
    const app = manifest.assetGroups.find((group) => group.name === "app");

    // `ng build` sets the index to the CSR shell's name whatever ngsw-config.json says; the config
    // names it too, so this spec and the built ngsw.json agree.
    expect(manifest.index).toBe("/index.csr.html");
    expect(app?.urls).toContain(manifest.index);
  });
});
