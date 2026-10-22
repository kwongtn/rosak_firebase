import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { readRelease } from "./sentry-sourcemaps.mjs";

const HASH = "5c0d457f3e9e61fa641704a99d412b0d539857e7";
const roots = [];

function rootWith(versionJson) {
  const root = mkdtempSync(join(tmpdir(), "sentry-sourcemaps-"));
  roots.push(root);
  if (versionJson !== undefined) {
    mkdirSync(join(root, "public"));
    writeFileSync(join(root, "public/version.json"), versionJson);
  }
  return root;
}

describe("readRelease", () => {
  after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

  it("returns the full hash build-info wrote, not a shortened one", () => {
    const root = rootWith(`${JSON.stringify({ hash: HASH, timestamp: "2026-10-22T00:00:00Z" })}\n`);
    assert.equal(readRelease(root), HASH);
  });

  it("returns null when build-info recorded no git hash", () => {
    assert.equal(readRelease(rootWith(JSON.stringify({ hash: "unknown" }))), null);
    assert.equal(readRelease(rootWith(JSON.stringify({ timestamp: "x" }))), null);
  });

  it("returns null when version.json does not exist", () => {
    assert.equal(readRelease(rootWith()), null);
  });
});
