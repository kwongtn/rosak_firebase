import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
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

  it("returns null, not a crash, when version.json is malformed", () => {
    assert.equal(readRelease(rootWith("{ not json")), null);
  });
});

// Runs a copy of the script from a throwaway root, so a developer's real .sentryclirc and dist/
// never take part. Every run must exit 0 without reaching sentry-cli (no network, no npx).
describe("sentry-sourcemaps CLI", () => {
  const script = join(dirname(fileURLToPath(import.meta.url)), "sentry-sourcemaps.mjs");

  function run(env, { versionJson, withDist } = {}) {
    const root = rootWith(versionJson);
    mkdirSync(join(root, "scripts"));
    copyFileSync(script, join(root, "scripts/sentry-sourcemaps.mjs"));
    if (withDist) {
      mkdirSync(join(root, "dist/web"), { recursive: true });
    }
    const { SENTRY_AUTH_TOKEN: _token, ...base } = process.env;
    const result = spawnSync(process.execPath, [join(root, "scripts/sentry-sourcemaps.mjs")], {
      env: { ...base, ...env },
      encoding: "utf8",
    });
    return { status: result.status, lines: result.stdout.trim().split("\n") };
  }

  it("logs one line and exits 0 when there is no auth token", () => {
    const { status, lines } = run({}, { versionJson: JSON.stringify({ hash: HASH }) });
    assert.equal(status, 0);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /No Sentry auth token/);
  });

  it("logs one line and exits 0 when the token is set but there is no release hash", () => {
    const { status, lines } = run(
      { SENTRY_AUTH_TOKEN: "dummy" },
      { versionJson: JSON.stringify({ hash: "unknown" }), withDist: true },
    );
    assert.equal(status, 0);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /No usable release hash/);
  });
});
