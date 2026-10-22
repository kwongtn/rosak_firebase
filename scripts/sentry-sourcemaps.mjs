#!/usr/bin/env node
// Runs automatically after `npm run build` (see package.json's `postbuild`) — injects Sentry
// debug IDs into the production build's *hidden* source maps (see angular.json's
// `sourceMap: { hidden: true }`: the maps exist on disk but ship with no `sourceMappingURL`
// comment, so a real visitor's devtools never sees or fetches one) and uploads them, then
// creates and finalizes a Sentry release named with the same full git hash `sentrySharedOptions`
// stamps onto every event at runtime (see ../src/sentry-options.ts) — read from the
// public/version.json that scripts/generate-build-info.mjs writes next to src/build-info.ts, so
// both always agree — that shared identifier is what lets Sentry's release page line up with the
// events and its commit/regression tracking work.
//
// Deliberately soft-fails (logs and exits 0) rather than breaking the build when Sentry isn't
// configured at all — a contributor without org access, or CI running against a fork, should
// still be able to produce a working build; only a real deploy needs this step to fully succeed.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SENTRY_ORG = "kwongtn";
const SENTRY_PROJECT = "javascript-angular";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(rootDir, "dist/web");

/**
 * The release name: the `hash` build-info stamped into the build, or null when there is none to
 * use (version.json missing or malformed, or "unknown" because the build had no git checkout).
 */
export function readRelease(root) {
  const versionJson = join(root, "public/version.json");
  if (!existsSync(versionJson)) {
    return null;
  }
  let hash;
  try {
    ({ hash } = JSON.parse(readFileSync(versionJson, "utf8")));
  } catch {
    // This script soft-fails by design: unreadable build info means no release, not a failed build.
    return null;
  }
  return hash && hash !== "unknown" ? hash : null;
}

// Only upload when run directly (`postbuild`), not when a test imports readRelease.
if (realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  function hasAuthToken() {
    if (process.env["SENTRY_AUTH_TOKEN"]) {
      return true;
    }
    const rc = join(rootDir, ".sentryclirc");
    return existsSync(rc) && readFileSync(rc, "utf8").includes("token=");
  }

  if (!hasAuthToken()) {
    console.log(
      "[sentry-sourcemaps] No Sentry auth token found (.sentryclirc / SENTRY_AUTH_TOKEN) — skipping upload.",
    );
    process.exit(0);
  }

  if (!existsSync(distDir)) {
    console.log(
      `[sentry-sourcemaps] ${distDir} doesn't exist — skipping (did the build actually run?).`,
    );
    process.exit(0);
  }

  const release = readRelease(rootDir);
  if (!release) {
    console.log(
      "[sentry-sourcemaps] No usable release hash in public/version.json (missing, malformed, or build-info ran without git?) — skipping upload.",
    );
    process.exit(0);
  }

  function sentryCli(args) {
    execFileSync("npx", ["@sentry/cli", ...args], { cwd: rootDir, stdio: "inherit" });
  }

  console.log(`[sentry-sourcemaps] Releasing ${release} for ${SENTRY_ORG}/${SENTRY_PROJECT}...`);
  sentryCli(["sourcemaps", "inject", "--org", SENTRY_ORG, "--project", SENTRY_PROJECT, distDir]);
  sentryCli(["releases", "--org", SENTRY_ORG, "--project", SENTRY_PROJECT, "new", release]);
  sentryCli([
    "sourcemaps",
    "upload",
    "--org",
    SENTRY_ORG,
    "--project",
    SENTRY_PROJECT,
    "--release",
    release,
    distDir,
  ]);
  sentryCli(["releases", "--org", SENTRY_ORG, "--project", SENTRY_PROJECT, "finalize", release]);
  console.log(`[sentry-sourcemaps] Done.`);
}
