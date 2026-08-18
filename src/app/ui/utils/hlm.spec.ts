import { describe, expect, it } from "vitest";
import { hlm } from "./hlm";

describe("hlm", () => {
  it("should return empty string when given no arguments or empty inputs", () => {
    expect(hlm()).toBe("");
    expect(hlm("")).toBe("");
    expect(hlm(null, undefined, false, "")).toBe("");
  });

  it("should merge single and multiple class names", () => {
    expect(hlm("px-2 py-1")).toBe("px-2 py-1");
    expect(hlm("px-2", "py-1", "bg-red-500")).toBe("px-2 py-1 bg-red-500");
  });

  it("should resolve Tailwind conflicts with later classes winning", () => {
    expect(hlm("p-4", "p-2")).toBe("p-2");
    expect(hlm("bg-red-500 text-sm", "bg-blue-500")).toBe("text-sm bg-blue-500");
    expect(hlm("px-4", "px-2", "p-8")).toBe("p-8");
  });

  it("should handle conditional and various ClassValue structures", () => {
    expect(hlm("base-class", true && "active", false && "hidden")).toBe("base-class active");
    expect(hlm(["flex", "items-center"], ["justify-between"])).toBe(
      "flex items-center justify-between",
    );
    expect(hlm({ "font-bold": true, italic: false }, "text-lg")).toBe("font-bold text-lg");
    expect(
      hlm(
        "btn",
        ["nested-array", ["deep-nested"]],
        { enabled: true, disabled: false },
        undefined,
        null,
        "final-class",
      ),
    ).toBe("btn nested-array deep-nested enabled final-class");
  });
});
