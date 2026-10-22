import { ErrorHandler, provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import type { IdTokenResult, User } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastService } from "../../ui/toast/toast.service";
import { SESSION_DRAFT_PREFIX } from "../util/web-storage.util";
import { AuthService } from "./auth.service";

/**
 * The private Firebase callback, reached past `private`. The constructor registers it with
 * Firebase, and a `vi.mock` of `firebase/auth` is unreliable under `isolate: false` (MISTAKES.md),
 * so the spec builds the service on the e2e override path (no Firebase) and drives the callback.
 */
interface AuthInternals {
  applyUser(user: User | null): Promise<void>;
  resolveReady(): void;
}

function fakeUser(uid: string, readClaims: () => Promise<IdTokenResult>): User {
  return { uid, getIdTokenResult: readClaims } as unknown as User;
}

describe("AuthService", () => {
  let handleError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    handleError = vi.fn();
    vi.stubGlobal("__e2eAuthOverride__", { email: "e2e@example.com", admin: false });
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: ErrorHandler, useValue: { handleError } },
        { provide: ToastService, useValue: { error: vi.fn(), info: vi.fn() } },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    sessionStorage.clear();
    localStorage.clear();
  });

  function create(): { service: AuthService; internals: AuthInternals } {
    const service = TestBed.inject(AuthService);
    return { service, internals: service as unknown as AuthInternals };
  }

  it("releases whenReady, fails closed and reports the error when the admin claim cannot be read", async () => {
    const { service, internals } = create();
    const resolveReady = vi.spyOn(internals, "resolveReady");
    const failure = new Error("Firebase: Error (auth/network-request-failed).");

    await internals.applyUser(fakeUser("u1", () => Promise.reject(failure)));

    expect(resolveReady).toHaveBeenCalledTimes(1);
    expect(service.user()?.uid).toBe("u1");
    expect(service.isLoggedIn()).toBe(true);
    expect(service.isAdmin()).toBe(false);
    expect(handleError).toHaveBeenCalledExactlyOnceWith(failure);
  });

  it("publishes the admin claim before it releases whenReady", async () => {
    const { service, internals } = create();
    let adminWhenReleased: boolean | undefined;
    vi.spyOn(internals, "resolveReady").mockImplementation(() => {
      adminWhenReleased = service.isAdmin();
    });

    await internals.applyUser(
      fakeUser("u1", async () => ({ claims: { admin: true } }) as unknown as IdTokenResult),
    );

    expect(adminWhenReleased).toBe(true);
    expect(handleError).not.toHaveBeenCalled();
  });

  it("removes the report drafts this tab saved for an account once it signs out", async () => {
    const { internals } = create();
    const claims = async () => ({ claims: {} }) as unknown as IdTokenResult;
    const draftKey = `${SESSION_DRAFT_PREFIX}line-status:v1:line-1`;

    await internals.applyUser(fakeUser("u1", claims));
    sessionStorage.setItem(draftKey, "notes typed while signed in");
    await internals.applyUser(null);

    expect(sessionStorage.getItem(draftKey)).toBeNull();
  });

  it("still releases whenReady when the cached first name cannot be read", async () => {
    const { internals } = create();
    const resolveReady = vi.spyOn(internals, "resolveReady");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage is disabled", "SecurityError");
    });

    await internals.applyUser(
      fakeUser("u1", async () => ({ claims: {} }) as unknown as IdTokenResult),
    );

    expect(resolveReady).toHaveBeenCalledTimes(1);
  });
});
