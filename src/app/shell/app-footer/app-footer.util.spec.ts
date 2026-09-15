import { describe, expect, it } from "vitest";
import {
  BACKEND_REPO_URL,
  FRONTEND_REPO_URL,
  backendCommitUrl,
  frontendCommitUrl,
  isValidHash,
  toShortHash,
} from "./app-footer.util";

describe("isValidHash", () => {
  it("accepts 7-char hex (frontend short)", () => {
    expect(isValidHash("9d8208b")).toBe(true);
    expect(isValidHash("a1b2c3d")).toBe(true);
    expect(isValidHash("ABC1234")).toBe(true);
  });

  it("accepts 8-char hex (backend short previously)", () => {
    expect(isValidHash("a1b2c3d4")).toBe(true);
  });

  it("accepts full 40-char hex", () => {
    const full = "9d8208b1f98692342235e19be8f3f25457d520c9";
    expect(isValidHash(full)).toBe(true);
    expect(isValidHash(full.toUpperCase())).toBe(true);
  });

  it("rejects placeholders and empty", () => {
    expect(isValidHash("unknown")).toBe(false);
    expect(isValidHash("<<No hash data>>")).toBe(false);
    expect(isValidHash("")).toBe(false);
  });

  it("rejects too-short and non-hex", () => {
    expect(isValidHash("abc")).toBe(false);
    expect(isValidHash("123456")).toBe(false); // 6 chars
    expect(isValidHash("zzzzzzz")).toBe(false);
    expect(isValidHash("a1b2c3d4g")).toBe(false);
    expect(isValidHash("a1b2c3!")).toBe(false);
  });

  it("rejects hashes longer than 40", () => {
    expect(isValidHash("a".repeat(41))).toBe(false);
  });
});

describe("toShortHash", () => {
  it("slices valid hashes to 7 chars", () => {
    const full = "9d8208b1f98692342235e19be8f3f25457d520c9";
    expect(toShortHash(full)).toBe("9d8208b");
    expect(toShortHash("a1b2c3d4")).toBe("a1b2c3d");
    expect(toShortHash("abc1234")).toBe("abc1234");
  });

  it("returns original for invalid/placeholder hashes", () => {
    expect(toShortHash("unknown")).toBe("unknown");
    expect(toShortHash("<<No hash data>>")).toBe("<<No hash data>>");
    expect(toShortHash("")).toBe("");
    expect(toShortHash("abc")).toBe("abc");
  });
});

describe("commit Urls", () => {
  it("builds frontend commit url with full hash", () => {
    const full = "9d8208b1f98692342235e19be8f3f25457d520c9";
    expect(frontendCommitUrl(full)).toBe(`${FRONTEND_REPO_URL}/commit/${full}`);
  });

  it("builds backend commit url with full hash", () => {
    const full = "f1b89ec1a285698dfa8bf870cfa4c70f9a5462fd";
    expect(backendCommitUrl(full)).toBe(`${BACKEND_REPO_URL}/commit/${full}`);
  });

  it("uses short hash in url when given short (still valid link, GitHub resolves)", () => {
    expect(frontendCommitUrl("abc1234")).toBe(`${FRONTEND_REPO_URL}/commit/abc1234`);
  });

  it("exposes correct repo urls", () => {
    expect(FRONTEND_REPO_URL).toBe("https://github.com/kwongtn/rosak_firebase");
    expect(BACKEND_REPO_URL).toBe("https://github.com/kwongtn/lift-rosak-backend");
  });
});
