#!/usr/bin/env node
// Runs automatically after `npm run build` (see package.json's `postbuild`) — injects Sentry
// debug IDs into the production build's *hidden* source maps (see angular.json's
// `sourceMap: { hidden: true }`: the maps exist on disk but ship with no `sourceMappingURL`
// comment, so a real visitor's devtools never sees or fetches one) and uploads them, then
// creates and finalizes a Sentry release tagged with the same git hash `sentrySharedOptions`
// stamps onto every event at runtime (see ../src/sentry-options.ts) — that shared identifier is
// what actually lets Sentry match a captured stack trace back to these uploaded maps.
//
// Deliberately soft-fails (logs and exits 0) rather than breaking the build when Sentry isn't
// configured at all — a contributor without org access, or CI running against a fork, should
// still be able to produce a working build; only a real deploy needs this step to fully succeed.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SENTRY_ORG = "kwongtn";
const SENTRY_PROJECT = "javascript-angular";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(rootDir, "dist/web");

function hasAuthToken() {
    if (process.env["SENTRY_AUTH_TOKEN"]) {
        return true;
    }
    const rc = join(rootDir, ".sentryclirc");
    return existsSync(rc) && readFileSync(rc, "utf8").includes("token=");
}

if (!hasAuthToken()) {
    console.log("[sentry-sourcemaps] No Sentry auth token found (.sentryclirc / SENTRY_AUTH_TOKEN) — skipping upload.");
    process.exit(0);
}

if (!existsSync(distDir)) {
    console.log(`[sentry-sourcemaps] ${distDir} doesn't exist — skipping (did the build actually run?).`);
    process.exit(0);
}

const release = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: rootDir, encoding: "utf8" }).trim();

function sentryCli(args) {
    execFileSync("npx", ["@sentry/cli", ...args], { cwd: rootDir, stdio: "inherit" });
}

console.log(`[sentry-sourcemaps] Releasing ${release} for ${SENTRY_ORG}/${SENTRY_PROJECT}...`);
sentryCli(["sourcemaps", "inject", "--org", SENTRY_ORG, "--project", SENTRY_PROJECT, distDir]);
sentryCli(["releases", "--org", SENTRY_ORG, "--project", SENTRY_PROJECT, "new", release]);
sentryCli(["sourcemaps", "upload", "--org", SENTRY_ORG, "--project", SENTRY_PROJECT, "--release", release, distDir]);
sentryCli(["releases", "--org", SENTRY_ORG, "--project", SENTRY_PROJECT, "finalize", release]);
console.log(`[sentry-sourcemaps] Done.`);
