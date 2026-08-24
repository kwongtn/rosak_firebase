/** Lowercase phrases every engine uses when a dynamic `import()` of a lazy chunk fails —
 * Chrome ("Failed to fetch dynamically imported module: …"), Firefox ("Error loading
 * dynamically imported module"), Safari ("Importing a module script failed"), and webpack-era
 * bundlers ("Loading chunk 12 failed"). One phrase per distinct wording; the first covers both
 * Chrome's and Firefox's sentences. */
const CHUNK_LOAD_ERROR_PHRASES: readonly string[] = [
  "dynamically imported module",
  "importing a module script failed",
  "loading chunk",
];

/** A resource-error event carries no message text at all — just the failing `<script>`'s URL
 * (e.g. "/chunk-D4-DL31Z2.js", hash-suffixed by outputHashing: "all") — so a URL-shaped string
 * ending in `.js` counts too. Requires a `/` before the filename so prose that merely mentions
 * a "foo.js" file doesn't match. */
const CHUNK_URL_PATTERN = /\/[^\s/'"]+\.js(?:\?[^\s]*)?(?:#[^\s]*)?$/i;

/**
 * Whether an error message (or a failed `<script>`'s URL) indicates a lazily-loaded JS chunk
 * failed to download — the signature symptom of a new deploy: this tab is still running old JS
 * whose hashed chunk filenames no longer exist on the server, so the click that triggered the
 * lazy load 404'd. Pure so the detection logic is unit-testable independently of the
 * browser-only listeners that feed it (see new-version.service.ts).
 */
export function isChunkLoadError(message: string): boolean {
  if (!message) {
    return false;
  }
  const lowercased = message.toLowerCase();
  if (CHUNK_LOAD_ERROR_PHRASES.some((phrase) => lowercased.includes(phrase))) {
    return true;
  }
  return CHUNK_URL_PATTERN.test(message);
}
