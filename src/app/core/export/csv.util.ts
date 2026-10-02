/**
 * CSV serialisation for the "export what I am looking at" affordances.
 *
 * Split the same way `core/url-state/query-param.util.ts` splits its read/write halves, and for the
 * same SSR reason: {@link toCsv} is a PURE function with no platform dependency at all, so it is
 * unit-testable without a DOM and can run on the server; {@link downloadCsv} is the only half that
 * touches a browser API and it takes the platform flag as a parameter for the documented reason —
 * reading `PLATFORM_ID` needs an injection context that a plain function should not have.
 *
 * 🔴 **`toCsv` always emits a header row, including for zero rows.** A CSV whose header is missing
 * has no columns at all, so a spreadsheet shows one empty sheet and the reader cannot tell "the
 * export found nothing" from "the export is broken". The header carries the column names on their
 * own, so "No rows" is visible as a header and no data rather than as an empty document.
 *
 * Rows are keyed by COLUMN NAME rather than positionally. A positional row silently shifts every
 * value one column to the left the moment a column is inserted or a builder forgets a trailing
 * cell — and a CSV of hourly status buckets read one hour off is a plausible-looking lie, which is
 * the worst failure this file can have. A keyed row degrades instead: a missing key exports as an
 * empty cell, in the right column.
 */

/** What a single CSV cell may hold. `null`/`undefined` are the two spellings of "no value" and both
 * export as an EMPTY cell — never the strings "null"/"undefined". */
export type CsvCell = string | number | null | undefined;

/** One data row, keyed by the column it belongs to (see the file doc for why it is not positional). */
export type CsvRow = Readonly<Record<string, CsvCell>>;

/**
 * RFC 4180's line terminator.
 *
 * `CRLF`, not `\n`: the spec mandates it, and the two readers that matter most (Excel, Sheets)
 * both handle it without a second thought while a bare `\n` occasionally lands as one long row.
 */
const LINE_ENDING = "\r\n";

/** Characters that force a field to be quoted. RFC 4180 §2: a field containing a quote, a comma or
 * a line break must be enclosed in double quotes. */
const NEEDS_QUOTING = /["\r\n,]/;

/**
 * One cell as an RFC-4180 field.
 *
 * A quote inside a quoted field is written TWICE (`"` → `""`), which is the only escape RFC 4180
 * defines — a backslash escape is a spreadsheet formula injection waiting to happen and silently
 * truncates the value in half of the readers. Quoting is applied on the presence of the character
 * and not on a pre-checked length, because a leading/trailing space is also worth quoting for
 * readers that trim unquoted fields.
 */
function toField(cell: CsvCell): string {
  if (cell === null || cell === undefined) {
    return "";
  }
  const value = typeof cell === "number" ? String(cell) : cell;
  if (!NEEDS_QUOTING.test(value)) {
    return value;
  }
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * `columns` plus `rows` as one RFC-4180 document, CRLF-terminated.
 *
 * The header row comes FIRST and always — see the file doc for why an empty export is header-only
 * rather than empty. `rows` are emitted in the order given: this is an export of what the reader is
 * looking at, and re-sorting it behind their back would make the file disagree with the screen.
 *
 * A duplicate column name is emitted twice rather than deduplicated: the caller asked for two
 * columns with that name, and silently collapsing them would hide data.
 */
export function toCsv(columns: readonly string[], rows: readonly CsvRow[]): string {
  const lines: string[] = [columns.map(toField).join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => toField(row[column])).join(","));
  }
  return lines.join(LINE_ENDING) + LINE_ENDING;
}

/**
 * Hands a serialised CSV to the browser as a file download.
 *
 * `isBrowser` is a PARAMETER rather than an internal `isPlatformBrowser` check for the same reason
 * `writeQueryParams` takes one: reading `PLATFORM_ID` needs an injection context, and a plain
 * function has no business having one. On the server this is a no-op, which is what keeps an SSR
 * render from trying to build a `Blob` that no document will ever click.
 *
 * The anchor is created, clicked and REMOVED inside the call, and the object URL is revoked on the
 * next tick rather than synchronously: Firefox cancels an in-flight download when the URL is
 * revoked in the same turn as the click. Mirrors `tracker-info-panel.component.ts`'s own export —
 * the repo already had one of these and this is the shared version rather than a second one.
 */
export function downloadCsv(filename: string, csv: string, isBrowser: boolean): void {
  if (!isBrowser) {
    return;
  }
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
