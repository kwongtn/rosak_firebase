// Fails the build if the first-load graph references Sentry's replay or feedback code: one static
// use (Sentry.getReplay(), feedbackIntegration, ...) re-links the real package into main while the
// lazy chunk keeps its own copy, and nothing else fails (see core/sentry/feedback.service.ts).
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
];
const COMMENT = /^\s*(\/\/|\/\*|\*)/;
const LAZY_DIR = join("src", "app", "core", "sentry");

const bad = [];
for (const entry of readdirSync("src", { recursive: true, withFileTypes: true })) {
  const file = join(entry.parentPath, entry.name);
  if (!entry.isFile() || !/\.(ts|mjs|js)$/.test(file) || file.startsWith(LAZY_DIR + "/")) {
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
    `Sentry replay/feedback must stay lazy; reference them only under ${LAZY_DIR}/:\n${bad.join("\n")}`,
  );
  process.exit(1);
}
