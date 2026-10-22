import { describe, expect, it } from "vitest";

import { eventValue } from "./dom-event.util";

/** Dispatches a real event on `control` and returns what `eventValue` read from it. */
function readFrom(control: HTMLElement, type: "input" | "change"): string {
  let value: string | undefined;
  control.addEventListener(type, (event) => (value = eventValue(event)), { once: true });
  control.dispatchEvent(new Event(type, { bubbles: true }));
  if (value === undefined) {
    throw new Error("listener did not run");
  }
  return value;
}

describe("eventValue", () => {
  it("reads an <input>", () => {
    const input = document.createElement("input");
    input.value = "https://x.com/a";
    expect(readFrom(input, "input")).toBe("https://x.com/a");
  });

  it("reads a <textarea>", () => {
    const textarea = document.createElement("textarea");
    textarea.value = "line one\nline two";
    expect(readFrom(textarea, "input")).toBe("line one\nline two");
  });

  it("reads the selected <option> of a <select>", () => {
    const select = document.createElement("select");
    for (const value of ["any", "pending"]) {
      select.add(new Option(value, value));
    }
    select.value = "pending";
    expect(readFrom(select, "change")).toBe("pending");
  });
});
