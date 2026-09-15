import { describe, expect, it } from "vitest";

import { canEditLink } from "./can-edit.link.util";

describe("canEditLink", () => {
  it("hides the affordance when logged out", () => {
    expect(
      canEditLink(
        { user: { shortId: "abc12345" } },
        { isLoggedIn: false, isAdmin: false, userId: "abc12345…" },
      ),
    ).toBe(false);
  });

  it("lets an admin edit any link, even one without author info", () => {
    expect(canEditLink({ user: null }, { isLoggedIn: true, isAdmin: true, userId: "x" })).toBe(
      true,
    );
  });

  it("lets the submitter edit their own link (8-char shortId prefix match)", () => {
    expect(
      canEditLink(
        { user: { shortId: "abc12345" } },
        { isLoggedIn: true, isAdmin: false, userId: "abc12345some-long-uid" },
      ),
    ).toBe(true);
  });

  it("rejects a non-admin trying to edit someone else's link", () => {
    expect(
      canEditLink(
        { user: { shortId: "abc12345" } },
        { isLoggedIn: true, isAdmin: false, userId: "other1234…" },
      ),
    ).toBe(false);
  });

  it("rejects a non-admin when the link carries no author info (legacy row)", () => {
    expect(canEditLink({ user: null }, { isLoggedIn: true, isAdmin: false, userId: "x" })).toBe(
      false,
    );
  });
});
