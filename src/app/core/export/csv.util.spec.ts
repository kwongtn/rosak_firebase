import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { downloadCsv, toCsv } from "./csv.util";

/**
 * The exact bytes a spreadsheet receives, with every line break spelled out.
 *
 * The `<CRLF>` marker is load-bearing rather than cosmetic: the browser test runner normalises the
 * suite's own source but NOT a value produced at runtime, and a spec that asserts on a raw `"\r\n"`
 * literal silently passes a bare-`\n` implementation and fails a correct one on a different runner.
 * Splitting on the marker (rather than on `"\r\n"`) is also the only way to read a row whose own
 * value contains a line break, which is precisely the case the escaping exists for.
 */
function visible(csv: string): string {
  return csv.replace(/\r\n/g, "<CRLF>").replace(/\n/g, "<LF>").replace(/\r/g, "<CR>");
}

/** {@link visible}, split into rows on the row terminator only. */
function visibleRows(csv: string): string[] {
  return visible(csv).split("<CRLF>");
}

describe("csv.util: toCsv", () => {
  it("emits a header row even when there are no rows at all", () => {
    // Acceptance rule: an export with nothing in it must still be a document a reader can read.
    // A headerless empty file is indistinguishable from a broken one.
    const csv = toCsv(["lineCode", "count"], []);

    expect(visible(csv)).toBe("lineCode,count<CRLF>");
    expect(visibleRows(csv).filter((line) => line !== "")).toHaveLength(1);
  });

  it("writes one CRLF-terminated line per row, after the header", () => {
    const csv = toCsv(
      ["a", "b"],
      [
        { a: 1, b: "x" },
        { a: 2, b: "y" },
      ],
    );

    expect(visible(csv)).toBe("a,b<CRLF>1,x<CRLF>2,y<CRLF>");
  });

  it("escapes a comma, a quote and a newline per RFC 4180, and doubles inner quotes", () => {
    const csv = toCsv(
      ["title"],
      [
        { title: "Kajang, Sri Petaling" },
        { title: 'He said "delayed"' },
        { title: "line one\nline two" },
      ],
    );
    const rows = visibleRows(csv);

    expect(rows[1]).toBe('"Kajang, Sri Petaling"');
    // The only escape RFC 4180 defines is the doubled quote; a backslash would truncate the value
    // in half the readers.
    expect(rows[2]).toBe('"He said ""delayed"""');
    expect(rows[3]).toBe('"line one<LF>line two"');
  });

  it("quotes a value containing a CRLF, and keeps it inside ONE row", () => {
    // A CRLF inside an unquoted field is what silently splits one record into two in a
    // spreadsheet — the reader then sees a phantom row they cannot account for.
    const csv = toCsv(["title"], [{ title: "carriage\r\nreturn" }]);

    expect(visible(csv)).toBe('title<CRLF>"carriage<CRLF>return"<CRLF>');
  });

  it("leaves an ordinary value unquoted", () => {
    // Quoting everything is valid CSV and unreadable in a diff; the escaping must be minimal.
    expect(toCsv(["code"], [{ code: "K10" }])).toBe("code\r\nK10\r\n");
  });

  it("writes null and undefined as an EMPTY cell, never the words", () => {
    const rows = visibleRows(toCsv(["a", "b", "c"], [{ a: null, b: undefined, c: 0 }]));

    // A literal "null" in a numeric column is a spreadsheet error the reader has to decode.
    expect(rows[1]).toBe(",,0");
    // …and a zero is data, not an absence.
    expect(rows[1].endsWith("0")).toBe(true);
  });

  it("keys rows by column name, so a missing key is an empty cell and not a shifted value", () => {
    // Positional rows would put 3 where 1 belongs the moment a builder forgets a field.
    expect(visibleRows(toCsv(["a", "b", "c"], [{ a: 1, c: 3 }]))[1]).toBe("1,,3");
  });

  it("escapes a column NAME the same way it escapes a value", () => {
    expect(visible(toCsv(['a,b"c'], []))).toBe('"a,b""c"<CRLF>');
  });

  it("emits a duplicate column name twice rather than collapsing it", () => {
    const csv = toCsv(["count", "count"], [{ count: 1 }]);

    expect(csv.split("\r\n")[1]).toBe("1,1");
  });

  it("keeps a negative number's sign intact (no quoting, no abs)", () => {
    expect(toCsv(["delta"], [{ delta: -12 }])).toBe("delta\r\n-12\r\n");
  });
});

describe("csv.util: downloadCsv", () => {
  /** The `download` attribute of every anchor that was clicked, in click order. */
  const clicked: string[] = [];
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clicked.length = 0;
    createObjectURL = vi.fn(() => "blob:fake");
    revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: {
      getAttribute(name: string): string | null;
    }) {
      clicked.push(this.getAttribute("download") ?? "");
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("builds a blob, clicks a temporary anchor and cleans both up", async () => {
    downloadCsv("lines.csv", "a\r\n", true);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const [blobArg] = createObjectURL.mock.calls[0];
    expect(blobArg).toBeInstanceOf(Blob);
    expect((blobArg as Blob).type).toBe("text/csv;charset=utf-8;");
    expect(clicked).toEqual(["lines.csv"]);
    // The anchor must not survive the download — a stray off-screen link is a duplicate target.
    expect(document.querySelectorAll("a[download]")).toHaveLength(0);
  });

  it("revokes the object URL on the NEXT tick, never in the same turn as the click", async () => {
    // Revoking synchronously cancels the download in Firefox.
    downloadCsv("lines.csv", "a\r\n", true);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake");
  });

  it("is a no-op on the server, where there is no document to click", () => {
    downloadCsv("lines.csv", "a\r\n", false);

    expect(createObjectURL).not.toHaveBeenCalled();
    expect(clicked).toEqual([]);
  });
});
