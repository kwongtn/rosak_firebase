/**
 * JSON download, the second file format `core/export` serves after CSV.
 *
 * It keeps `downloadCsv`'s contract: `isBrowser` is a PARAMETER (reading `PLATFORM_ID` needs an
 * injection context a plain function should not have), the call is a no-op on the server, the
 * anchor is created, clicked and REMOVED inside the call, and the object URL is revoked on the next
 * tick because Firefox cancels a download whose URL is revoked in the turn of the click.
 *
 * shortcut: the blob-and-anchor steps copy `downloadCsv`'s, so this change touches no shared file.
 * Merge the two into one `downloadText(filename, text, mime, isBrowser)` when a third format needs it.
 */

/**
 * Hands `value` to the browser as a pretty-printed `.json` download (two-space indent, trailing
 * newline). The value goes through `JSON.stringify`, so it must be plain data: a `Date` becomes its
 * ISO string, and `undefined` and functions are dropped.
 */
export function downloadJson(filename: string, value: unknown, isBrowser: boolean): void {
  if (!isBrowser) {
    return;
  }
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], {
    type: "application/json;charset=utf-8;",
  });
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
