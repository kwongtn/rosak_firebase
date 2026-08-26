import { isAdPreviewEnabled, mapAdStatus } from "./ad-slot.component";

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

describe("mapAdStatus", () => {
  it('maps "filled" to filled', () => {
    expect(mapAdStatus("filled")).toBe("filled");
  });

  it('maps "unfilled" to unfilled', () => {
    expect(mapAdStatus("unfilled")).toBe("unfilled");
  });

  it("maps anything else to pending", () => {
    expect(mapAdStatus(null)).toBe("pending");
    expect(mapAdStatus(undefined)).toBe("pending");
    expect(mapAdStatus("weird")).toBe("pending");
    expect(mapAdStatus("")).toBe("pending");
  });
});
