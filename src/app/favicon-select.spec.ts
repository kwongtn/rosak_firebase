import { selectVariant } from "../../scripts/favicon-select.mjs";

describe("selectVariant (favicon environment mapping)", () => {
  it("returns green for local dev (unset / empty / development)", () => {
    expect(selectVariant(undefined)).toBe("green");
    expect(selectVariant("")).toBe("green");
    expect(selectVariant("development")).toBe("green");
  });

  it("returns blue for staging", () => {
    expect(selectVariant("staging")).toBe("blue");
  });

  it("returns default (orange) for production", () => {
    expect(selectVariant("production")).toBe("default");
  });

  it("treats any unknown value as green (local dev fallback)", () => {
    expect(selectVariant("foo")).toBe("green");
    expect(selectVariant("STAGING")).toBe("green");
  });
});
