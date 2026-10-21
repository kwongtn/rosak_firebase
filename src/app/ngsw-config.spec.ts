import { Generator, type Config, type Filesystem } from "@angular/service-worker/config";
import { describe, expect, it } from "vitest";

import ngswConfig from "../../ngsw-config.json";

/** The slice of the generated ngsw.json these rules are about. */
interface NgswManifest {
  index: string;
  assetGroups: { name: string; installMode: string; urls: string[] }[];
  dataGroups: unknown[];
  navigationUrls: unknown[];
  navigationRequestStrategy: string;
}

/** A production build's browser output, reduced to one file of each kind. */
const BUILD_OUTPUT = [
  "/index.csr.html",
  "/main-ABC123.js",
  "/main-ABC123.js.map",
  "/chunk-DEF456.js",
  "/styles-GHI789.css",
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

describe("ngsw-config.json", () => {
  it("prefetches exactly the hashed JS and CSS", async () => {
    const { assetGroups } = await generateManifest();

    expect(assetGroups.find((group) => group.name === "app")).toMatchObject({
      installMode: "prefetch",
      urls: ["/chunk-DEF456.js", "/main-ABC123.js", "/styles-GHI789.css"],
    });
  });

  it("caches images only lazily, on first use", async () => {
    const { assetGroups } = await generateManifest();

    expect(assetGroups.find((group) => group.name === "media")).toMatchObject({
      installMode: "lazy",
      urls: ["/favicon.svg", "/icons/icon-192.png"],
    });
  });

  it("never caches HTML, /version.json, the manifest or source maps", async () => {
    const { assetGroups, dataGroups } = await generateManifest();
    const cached = assetGroups.flatMap((group) => group.urls);

    expect(cached.filter((url) => /\.(html|json|webmanifest|map|txt)$/.test(url))).toEqual([]);
    // GraphQL reads are POSTs, which ngsw never caches, so a data group would only add work.
    expect(dataGroups).toEqual([]);
  });

  it("sends every navigation to the network, so SSR answers each route", async () => {
    const manifest = await generateManifest();

    expect(manifest.navigationUrls).toEqual([]);
    expect(manifest.navigationRequestStrategy).toBe("freshness");
    expect(manifest.index).toBe("/index.html");
  });
});
