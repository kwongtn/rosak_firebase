import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { downloadJson } from "./json.util";

/** A Blob's text, through FileReader because the test DOM's Blob has no `text()` on every runner. */
function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe("json.util: downloadJson", () => {
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

  it("builds a JSON blob, clicks a temporary anchor and cleans it up", () => {
    downloadJson("rows.json", [{ a: 1 }], true);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const [blobArg] = createObjectURL.mock.calls[0];
    expect(blobArg).toBeInstanceOf(Blob);
    expect((blobArg as Blob).type).toBe("application/json;charset=utf-8;");
    expect(clicked).toEqual(["rows.json"]);
    // The anchor must not survive the download: a stray off-screen link is a duplicate target.
    expect(document.querySelectorAll("a[download]")).toHaveLength(0);
  });

  it("writes the value pretty-printed with a trailing newline, and it parses back unchanged", async () => {
    const rows = [
      { date: "2026-09-18", notes: null, "media count": 0 },
      { date: "2026-09-19", notes: 'He said "late"', "media count": 2 },
    ];

    downloadJson("rows.json", rows, true);
    const text = await blobText(createObjectURL.mock.calls[0][0] as Blob);

    expect(text.endsWith("]\n")).toBe(true);
    expect(text).toContain('\n  {\n    "date": "2026-09-18"');
    expect(JSON.parse(text)).toEqual(rows);
  });

  it("revokes the object URL on the NEXT tick, never in the same turn as the click", async () => {
    // Revoking synchronously cancels the download in Firefox.
    downloadJson("rows.json", [], true);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake");
  });

  it("is a no-op on the server, where there is no document to click", () => {
    downloadJson("rows.json", [], false);

    expect(createObjectURL).not.toHaveBeenCalled();
    expect(clicked).toEqual([]);
  });
});
