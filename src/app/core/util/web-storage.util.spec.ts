import { afterEach, describe, expect, it, vi } from "vitest";

import { readStorageItem, removeStorageItem, writeStorageItem } from "./web-storage.util";

describe("web storage helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("reads back what it wrote, in the area it was written to", () => {
    writeStorageItem("local", "k", "local value");
    writeStorageItem("session", "k", "session value");

    expect(readStorageItem("local", "k")).toBe("local value");
    expect(readStorageItem("session", "k")).toBe("session value");
    expect(localStorage.getItem("k")).toBe("local value");
    expect(sessionStorage.getItem("k")).toBe("session value");
  });

  it("returns null for a key that was never written, and after a removal", () => {
    expect(readStorageItem("session", "missing")).toBeNull();

    writeStorageItem("session", "k", "v");
    removeStorageItem("session", "k");

    expect(readStorageItem("session", "k")).toBeNull();
  });

  it("never throws when storage does", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });

    expect(readStorageItem("local", "k")).toBeNull();
    expect(() => writeStorageItem("local", "k", "v")).not.toThrow();
    expect(() => removeStorageItem("session", "k")).not.toThrow();
  });
});
