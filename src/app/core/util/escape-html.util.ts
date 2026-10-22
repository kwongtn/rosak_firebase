const ENTITIES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * `value` as text that is safe to put into an HTML string, in element content and in a quoted
 * attribute value alike (it escapes both quote kinds).
 *
 * Prefer `textContent` / `createElement` where the DOM is built by hand: escaping is then
 * structural instead of remembered. This is for the one place a string of markup is unavoidable
 * (an `[innerHTML]` binding), where untrusted text, such as a third-party feed's strings, must
 * not become markup.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c);
}
