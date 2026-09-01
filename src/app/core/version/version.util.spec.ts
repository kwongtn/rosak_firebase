import { describe, expect, it } from "vitest";
import { isSameCommit } from "./version.util";

describe("isSameCommit", () => {
  it("returns true for identical hashes", () => {
    const full = "9d8208b1f98692342235e19be8f3f25457d520c9";
    expect(isSameCommit(full, full)).toBe(true);
    expect(isSameCommit("abc1234", "abc1234")).toBe(true);
  });

  it("returns true when short is prefix of full (either direction)", () => {
    const full = "9d8208b1f98692342235e19be8f3f25457d520c9";
    const short = "9d8208b";
    expect(isSameCommit(short, full)).toBe(true);
    expect(isSameCommit(full, short)).toBe(true);
    expect(isSameCommit("a1b2c3d4", "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2")).toBe(true);
  });

  it("returns false for different commits", () => {
    const a = "9d8208b1f98692342235e19be8f3f25457d520c9";
    const b = "f1b89ec1a285698dfa8bf870cfa4c70f9a5462fd";
    expect(isSameCommit(a, b)).toBe(false);
    expect(isSameCommit("abc1234", "def5678")).toBe(false);
  });

  it("returns false for different full hashes sharing prefix but diverging", () => {
    const a = "abc1234aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const b = "abc1234bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    expect(isSameCommit(a, b)).toBe(false);
  });

  it("handles empty and unknown placeholders (not considered same unless identical)", () => {
    expect(isSameCommit("", "")).toBe(true);
    expect(isSameCommit("unknown", "unknown")).toBe(true);
    expect(isSameCommit("unknown", "9d8208b")).toBe(false);
  });
});
