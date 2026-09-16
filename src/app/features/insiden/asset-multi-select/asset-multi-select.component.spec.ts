import { describe, expect, it } from "vitest";

import { parentCodeChipText } from "./asset-multi-select.component";

describe("parentCodeChipText", () => {
  it("shows the last dash-separated segment of a line code", () => {
    expect(parentCodeChipText("KTMK-PKL")).toBe("PKL");
  });

  it("shows the last space-separated segment of a line code", () => {
    expect(parentCodeChipText("KTM ETS")).toBe("ETS");
  });

  it("keeps a code without separators as-is", () => {
    expect(parentCodeChipText("KJL")).toBe("KJL");
  });

  it("handles ragged separators and empty input", () => {
    expect(parentCodeChipText("--KTM--ETS--")).toBe("ETS");
    expect(parentCodeChipText("")).toBe("");
  });
});
