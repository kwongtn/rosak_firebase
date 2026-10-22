import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SESSION_DRAFT_PREFIX,
  claimSessionDrafts,
  readSessionDraft,
  readStorageItem,
  removeStorageItem,
  writeStorageItem,
} from "./web-storage.util";

const DRAFT = `${SESSION_DRAFT_PREFIX}line-status:v1:line-1`;
const OTHER_DRAFT = `${SESSION_DRAFT_PREFIX}spotting-report:v1`;

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

  describe("session drafts and the account they belong to", () => {
    it("removes every draft once the account that saved them signs out, and nothing else", () => {
      claimSessionDrafts("u1");
      sessionStorage.setItem(DRAFT, "a's notes");
      sessionStorage.setItem(OTHER_DRAFT, "a's spotting");
      sessionStorage.setItem("rosak:something-else", "kept");

      claimSessionDrafts(null);

      expect(sessionStorage.getItem(DRAFT)).toBeNull();
      expect(sessionStorage.getItem(OTHER_DRAFT)).toBeNull();
      expect(sessionStorage.getItem("rosak:something-else")).toBe("kept");
    });

    it("removes them when another account signs in without a sign-out in between", () => {
      claimSessionDrafts("u1");
      sessionStorage.setItem(DRAFT, "a's notes");

      claimSessionDrafts("u2");

      expect(sessionStorage.getItem(DRAFT)).toBeNull();
    });

    it("keeps a draft saved while signed out through the sign-in that follows", () => {
      claimSessionDrafts(null);
      sessionStorage.setItem(DRAFT, "typed before the login popup");

      claimSessionDrafts("u1");

      expect(readSessionDraft(DRAFT, "u1")).toBe("typed before the login popup");
    });

    it("keeps the drafts when the same account is restored, as after a reload", () => {
      claimSessionDrafts("u1");
      sessionStorage.setItem(DRAFT, "a's notes");

      claimSessionDrafts("u1");

      expect(readSessionDraft(DRAFT, "u1")).toBe("a's notes");
    });

    it("hides another account's draft before the new page knows who is signed in", () => {
      // The owner signed out in another tab while this one was unloaded: the draft is still here,
      // and the auth state of the reloaded page is not known yet.
      claimSessionDrafts("u1");
      sessionStorage.setItem(DRAFT, "a's notes");

      expect(readSessionDraft(DRAFT, null)).toBeNull();
      expect(readSessionDraft(DRAFT, "u2")).toBeNull();
      expect(readSessionDraft(DRAFT, "u1")).toBe("a's notes");
    });

    it("never throws when storage does", () => {
      vi.spyOn(Storage.prototype, "key").mockImplementation(() => {
        throw new DOMException("blocked", "SecurityError");
      });
      sessionStorage.setItem("rosak:draft-owner", "u1");

      expect(() => claimSessionDrafts(null)).not.toThrow();
    });
  });
});
