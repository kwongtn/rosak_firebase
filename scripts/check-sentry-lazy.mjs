// Fails the build if the first-load graph references Sentry's replay or feedback code: one static
// use (Sentry.getReplay(), feedbackIntegration, ...) re-links the real package into main while the
// lazy chunk keeps its own copy, and nothing else fails (see core/sentry/feedback.service.ts).
// Only the lazy-only files (the replay/feedback wrappers, their spec, lazy-modules.d.ts) may name
// that code, and every other file may load a wrapper only through import(), never a static import.
// shortcut: matches `Sentry.<name>` and `import { <name> } from "@sentry/..."`, so an aliased
// namespace import slips past; upgrade to a bundle-composition check if that ever happens.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const NAMES =
  "replayIntegration|getReplay|replayCanvasIntegration|feedback(?:Async|Sync)?Integration|getFeedback|sendFeedback";
const PATTERNS = [
  new RegExp(`\\bSentry\\.(?:${NAMES})\\b`),
  new RegExp(`import\\s*\\{[^}]*\\b(?:${NAMES})\\b[^}]*\\}\\s*from\\s*["']@sentry/`),
  /from\s+["']@sentry\/(?:replay|feedback|replay-canvas|browser)["']/,
  // A static value import of a wrapper pulls its ?lazy copy into the importing chunk. No path
  // prefix: siblings in core/sentry import it as "./feedback-integration".
  /^\s*(?:import|export)\s+(?!type\b)[^;]*?\bfrom\s+["'][^"']*(?:replay|feedback)-integration(?:\.ts)?["']/m,
];
const COMMENT = /^\s*(\/\/|\/\*|\*)/;
const LAZY_ONLY =
  /core\/sentry\/(?:replay-integration|feedback-integration(?:\.spec)?)\.ts$|core\/sentry\/lazy-modules\.d\.ts$/;

const bad = [];
for (const entry of readdirSync("src", { recursive: true, withFileTypes: true })) {
  const file = join(entry.parentPath, entry.name);
  if (!entry.isFile() || !/\.(ts|mjs|js)$/.test(file) || LAZY_ONLY.test(file)) {
    continue;
  }
  const code = readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => !COMMENT.test(line))
    .join("\n");
  if (PATTERNS.some((p) => p.test(code))) {
    bad.push(file);
  }
}
if (bad.length) {
  console.error(
    `Sentry replay/feedback must stay lazy: name it only in core/sentry/{replay,feedback}-integration.ts and lazy-modules.d.ts, and load a wrapper only with import():\n${bad.join("\n")}`,
  );
  process.exit(1);
}
