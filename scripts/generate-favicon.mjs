#!/usr/bin/env node
// Selects the favicon variant for the current environment and copies it into
// public/. Runs automatically before `build` and `start` (package.json
// prebuild/prestart), same pattern as the other scripts/*.mjs generators.
//
// Mapping (ENVIRONMENT_NAME is injected at BUILD time by apphosting.yaml /
// apphosting.staging.yaml; it is UNSET for local `npm start`):
//   "staging"    -> blue
//   "production" -> default (orange — the current production look, unchanged)
//   unset / "development" / anything else -> green (local dev)
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { selectVariant } from "./favicon-select.mjs";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(rootDir, "favicons");
const publicDir = join(rootDir, "public");

const env = process.env["ENVIRONMENT_NAME"];
const variant = selectVariant(env);

const svgSrc = join(srcDir, `${variant}.svg`);
const icoSrc = join(srcDir, `${variant}.ico`);
const svgDest = join(publicDir, "favicon.svg");
const icoDest = join(publicDir, "favicon.ico");

if (!existsSync(svgSrc)) {
  throw new Error(`[generate-favicon] missing source favicon: ${svgSrc}`);
}
mkdirSync(publicDir, { recursive: true });
copyFileSync(svgSrc, svgDest);
if (existsSync(icoSrc)) copyFileSync(icoSrc, icoDest);
else console.warn(`[generate-favicon] missing ${icoSrc}; favicon.ico not updated`);

console.log(`[generate-favicon] environment=${env ?? "(unset)"} -> variant=${variant}`);
