import { isAdPreviewEnabled } from "./ad-slot.component";

describe("isAdPreviewEnabled", () => {
  it("is true when ?adpreview=1 is present", () => {
    expect(isAdPreviewEnabled("?adpreview=1")).toBe(true);
  });

  it("is true when the param appears alongside others", () => {
    expect(isAdPreviewEnabled("?foo=bar&adpreview=1&baz=qux")).toBe(true);
  });

  it("is false when the param is absent", () => {
    expect(isAdPreviewEnabled("")).toBe(false);
    expect(isAdPreviewEnabled("?foo=bar")).toBe(false);
  });
});
