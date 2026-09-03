import { describe, expect, it } from "vitest";

import { canEditIncident, type CanEditIncidentContext } from "./can-edit.incident.util";

const AUTHOR_UID = "abcdef12-3456-7890-abcd-ef1234567890"; // shortId: "abcdef12"

function context(overrides: Partial<CanEditIncidentContext> = {}): CanEditIncidentContext {
  return {
    isLoggedIn: true,
    isAdmin: false,
    userId: AUTHOR_UID,
    ...overrides,
  };
}

function incident(
  overrides: {
    status?: string;
    user?: { shortId: string } | null;
  } = {},
): { status: string | undefined; user?: { shortId: string } | null } {
  return { status: undefined, user: null, ...overrides };
}

describe("canEditIncident", () => {
  it("is false when logged out, even for LIVE or admin", () => {
    expect(
      canEditIncident(incident({ status: "LIVE" }), context({ isLoggedIn: false, isAdmin: true })),
    ).toBe(false);
    expect(canEditIncident(incident(), context({ isLoggedIn: false }))).toBe(false);
  });

  it("is true for LIVE for any logged-in user", () => {
    expect(canEditIncident(incident({ status: "LIVE" }), context())).toBe(true);
    expect(
      canEditIncident(incident({ status: "live" }), context({ userId: "some-other-user" })),
    ).toBe(true);
  });

  it("allows the author to edit a DRAFT via the 8-char shortId prefix", () => {
    expect(
      canEditIncident(incident({ status: "DRAFT", user: { shortId: "abcdef12" } }), context()),
    ).toBe(true);
  });

  it("accepts lowercase stored statuses (draft/pending_approval)", () => {
    expect(
      canEditIncident(incident({ status: "draft", user: { shortId: "abcdef12" } }), context()),
    ).toBe(true);
    expect(
      canEditIncident(
        incident({ status: "pending_approval", user: { shortId: "abcdef12" } }),
        context(),
      ),
    ).toBe(true);
  });

  it("allows an admin to edit a pending incident without being the author", () => {
    expect(
      canEditIncident(
        incident({ status: "PENDING_APPROVAL", user: { shortId: "zzzzzzzz" } }),
        context({ isAdmin: true, userId: "other-user" }),
      ),
    ).toBe(true);
  });

  it("denies a non-author, non-admin edit of a pending incident", () => {
    expect(
      canEditIncident(
        incident({ status: "PENDING_APPROVAL", user: { shortId: "zzzzzzzz" } }),
        context({ userId: "some-other-user" }),
      ),
    ).toBe(false);
  });

  it("allows the author or an admin to edit a REJECTED incident, denies outsiders", () => {
    expect(
      canEditIncident(incident({ status: "REJECTED", user: { shortId: "abcdef12" } }), context()),
    ).toBe(true);
    expect(
      canEditIncident(
        incident({ status: "REJECTED", user: { shortId: "zzzzzzzz" } }),
        context({ isAdmin: true }),
      ),
    ).toBe(true);
    expect(
      canEditIncident(
        incident({ status: "REJECTED", user: { shortId: "zzzzzzzz" } }),
        context({ userId: "some-other-user" }),
      ),
    ).toBe(false);
  });

  it("is admin-only when status is missing (conservative)", () => {
    expect(canEditIncident(incident(), context({ isAdmin: true }))).toBe(true);
    expect(canEditIncident(incident(), context())).toBe(false);
    expect(canEditIncident(incident({ status: undefined }), context())).toBe(false);
  });

  it("is admin-only for unknown statuses", () => {
    expect(canEditIncident(incident({ status: "ARCHIVED" }), context({ isAdmin: true }))).toBe(
      true,
    );
    expect(canEditIncident(incident({ status: "ARCHIVED" }), context())).toBe(false);
  });

  it("never treats a missing incident user + missing uid as an author match", () => {
    expect(canEditIncident(incident({ status: "DRAFT", user: null }), context())).toBe(false);
    expect(
      canEditIncident(
        incident({ status: "DRAFT", user: { shortId: "abcdef12" } }),
        context({ userId: null }),
      ),
    ).toBe(false);
  });

  it("only the first 8 uid characters matter, not a longer match", () => {
    expect(
      canEditIncident(
        incident({ status: "DRAFT", user: { shortId: "abcdef12" } }),
        context({ userId: "abcdef12-AAAA" }),
      ),
    ).toBe(true);
    expect(
      canEditIncident(
        incident({ status: "DRAFT", user: { shortId: "abcdef12" } }),
        context({ userId: "abcdef13-AAAA" }),
      ),
    ).toBe(false);
  });
});
