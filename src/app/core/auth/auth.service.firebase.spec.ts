import { ErrorHandler, PLATFORM_ID, provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import type { IdTokenResult, User } from "firebase/auth";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastService } from "../../ui/toast/toast.service";
import { AuthService } from "./auth.service";

// The unit-test builder shares one module cache across spec files (`isolate: false`), so reset it on
// both sides of this file; see "Unit-test isolation" in docs/COMPONENTS.md.
vi.hoisted(() => vi.resetModules());

const sdk = vi.hoisted(() => ({
  getAuth: vi.fn(),
  onAuthStateChanged: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  getAdditionalUserInfo: vi.fn(),
  GoogleAuthProvider: class {},
}));
const app = vi.hoisted(() => ({ getApps: vi.fn(), initializeApp: vi.fn() }));

vi.mock("firebase/auth", () => sdk);
vi.mock("firebase/app", () => app);

afterAll(() => vi.resetModules());

const AUTH = { auth: true };
const GIVEN_NAME_KEY = (uid: string) => `auth:given-name:${uid}`;

function user(uid: string, claims: Record<string, unknown> = {}): User {
  return {
    uid,
    getIdTokenResult: async () => ({ claims }) as unknown as IdTokenResult,
    getIdToken: async () => `token-of-${uid}`,
  } as unknown as User;
}

/** Firebase's `onAuthStateChanged(auth, next, error)` registration the constructor made. */
function registered(): { next: (user: User | null) => void; error: (error: unknown) => void } {
  const call = sdk.onAuthStateChanged.mock.calls.at(-1);
  if (!call) throw new Error("onAuthStateChanged was not called");
  return { next: call[1], error: call[2] };
}

/** An error the way Firebase raises one: an `Error` with a `code`. */
function firebaseError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

describe("AuthService on Firebase Auth", () => {
  let handleError: ReturnType<typeof vi.fn>;
  let toast: { error: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    handleError = vi.fn();
    toast = { error: vi.fn(), info: vi.fn() };
    sdk.getAuth.mockReturnValue(AUTH);
    app.getApps.mockReturnValue([{ name: "[DEFAULT]" }]);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: ErrorHandler, useValue: { handleError } },
        { provide: ToastService, useValue: toast },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    [...Object.values(sdk), ...Object.values(app)].forEach((mock) => {
      if (vi.isMockFunction(mock)) mock.mockReset();
    });
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
  });

  describe("the e2e override", () => {
    it("signs in from the override without touching Firebase, as an admin when it says so", async () => {
      vi.stubGlobal("__e2eAuthOverride__", { email: "e2e@example.com", admin: true });

      const service = TestBed.inject(AuthService);

      await service.whenReady;
      expect(service.isLoggedIn()).toBe(true);
      expect(service.isAdmin()).toBe(true);
      expect(service.user()).toBeNull();
      expect(sdk.getAuth).not.toHaveBeenCalled();
      expect(sdk.onAuthStateChanged).not.toHaveBeenCalled();
    });

    it("is not an admin when the override says not", () => {
      vi.stubGlobal("__e2eAuthOverride__", { email: "e2e@example.com", admin: false });

      const service = TestBed.inject(AuthService);

      expect(service.isLoggedIn()).toBe(true);
      expect(service.isAdmin()).toBe(false);
    });

    it("has no ID token to send, because the override leaves the Firebase user empty", async () => {
      vi.stubGlobal("__e2eAuthOverride__", { email: "e2e@example.com", admin: false });

      expect(await TestBed.inject(AuthService).idToken()).toBeNull();
    });
  });

  describe("on the server", () => {
    it("is ready and signed out without touching Firebase", async () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          { provide: PLATFORM_ID, useValue: "server" },
          { provide: ErrorHandler, useValue: { handleError } },
          { provide: ToastService, useValue: toast },
        ],
      });

      const service = TestBed.inject(AuthService);

      await service.whenReady;
      expect(service.isLoggedIn()).toBe(false);
      expect(sdk.getAuth).not.toHaveBeenCalled();
    });
  });

  describe("restoring a session", () => {
    it("stays pending until Firebase answers, then publishes the user and releases whenReady", async () => {
      const service = TestBed.inject(AuthService);
      let ready = false;
      void service.whenReady.then(() => (ready = true));
      await Promise.resolve();
      expect(ready).toBe(false);
      expect(service.isLoggedIn()).toBe(false);

      registered().next(user("u1"));
      await service.whenReady;

      expect(service.user()?.uid).toBe("u1");
      expect(service.isLoggedIn()).toBe(true);
    });

    it("releases whenReady for a visitor Firebase confirms is signed out", async () => {
      const service = TestBed.inject(AuthService);

      registered().next(null);
      await service.whenReady;

      expect(service.isLoggedIn()).toBe(false);
      expect(service.isAdmin()).toBe(false);
    });

    it("reports a Firebase error and still releases whenReady, so the route guards do not hang", async () => {
      const service = TestBed.inject(AuthService);
      const failure = firebaseError("auth/network-request-failed", "offline");

      registered().error(failure);
      await service.whenReady;

      expect(handleError).toHaveBeenCalledExactlyOnceWith(failure);
      expect(service.isLoggedIn()).toBe(false);
    });

    it("releases whenReady and fails closed when the ID token result rejects", async () => {
      const service = TestBed.inject(AuthService);
      const failure = firebaseError("auth/network-request-failed", "token refresh failed");

      registered().next({
        uid: "u1",
        getIdTokenResult: () => Promise.reject(failure),
      } as unknown as User);
      await service.whenReady;

      expect(service.isAdmin()).toBe(false);
      expect(service.isLoggedIn()).toBe(true);
      expect(handleError).toHaveBeenCalledExactlyOnceWith(failure);
    });

    it.each([
      [{ admin: true }, true],
      [{ admin: "true" }, false],
      [{ admin: false }, false],
      [{}, false],
    ])("reads the admin claim %j as isAdmin %s", async (claims, isAdmin) => {
      const service = TestBed.inject(AuthService);

      registered().next(user("u1", claims));
      await service.whenReady;

      expect(service.isAdmin()).toBe(isAdmin);
    });

    it("takes admin away when the user signs out", async () => {
      const service = TestBed.inject(AuthService);
      registered().next(user("u1", { admin: true }));
      await service.whenReady;
      expect(service.isAdmin()).toBe(true);

      registered().next(null);

      await vi.waitFor(() => expect(service.isLoggedIn()).toBe(false));
      expect(service.isAdmin()).toBe(false);
      expect(service.user()).toBeNull();
    });
  });

  describe("the cached given name", () => {
    it("is read back for a restored session, from this uid's own key", async () => {
      localStorage.setItem(GIVEN_NAME_KEY("u1"), "Nur Aisyah");
      localStorage.setItem(GIVEN_NAME_KEY("u2"), "Someone Else");
      const service = TestBed.inject(AuthService);

      registered().next(user("u1"));
      await service.whenReady;

      expect(service.firstName()).toBe("Nur Aisyah");
    });

    it("is null for an account that never logged in on this browser", async () => {
      localStorage.setItem(GIVEN_NAME_KEY("u1"), "Nur Aisyah");
      const service = TestBed.inject(AuthService);

      registered().next(user("u2"));
      await service.whenReady;

      expect(service.firstName()).toBeNull();
    });

    it("is cleared when the user signs out", async () => {
      localStorage.setItem(GIVEN_NAME_KEY("u1"), "Nur Aisyah");
      const service = TestBed.inject(AuthService);
      registered().next(user("u1"));
      await service.whenReady;

      registered().next(null);

      await vi.waitFor(() => expect(service.firstName()).toBeNull());
    });
  });

  describe("login", () => {
    function signIn(signedIn: User, profile?: Record<string, unknown>): void {
      sdk.signInWithPopup.mockResolvedValue({ user: signedIn });
      sdk.getAdditionalUserInfo.mockReturnValue(profile ? { profile } : null);
    }

    it("returns the signed-in user and caches the provider's given_name under their uid", async () => {
      const service = TestBed.inject(AuthService);
      signIn(user("u1"), { given_name: "Nur Aisyah" });

      const result = await service.login();

      expect(result?.uid).toBe("u1");
      expect(sdk.signInWithPopup).toHaveBeenCalledWith(AUTH, expect.any(sdk.GoogleAuthProvider));
      expect(service.firstName()).toBe("Nur Aisyah");
      expect(localStorage.getItem(GIVEN_NAME_KEY("u1"))).toBe("Nur Aisyah");
      expect(toast.error).not.toHaveBeenCalled();
    });

    it.each([[undefined], [{ given_name: "" }], [{ given_name: 7 }]])(
      "caches nothing when the profile is %j",
      async (profile) => {
        const service = TestBed.inject(AuthService);
        signIn(user("u1"), profile);

        await service.login();

        expect(service.firstName()).toBeNull();
        expect(localStorage.getItem(GIVEN_NAME_KEY("u1"))).toBeNull();
      },
    );

    it("resolves to undefined without a toast when the rider closes the popup", async () => {
      const service = TestBed.inject(AuthService);
      sdk.signInWithPopup.mockRejectedValue(
        firebaseError("auth/popup-closed-by-user", "Firebase: Error (auth/popup-closed-by-user)."),
      );

      await expect(service.login()).resolves.toBeUndefined();

      expect(toast.error).not.toHaveBeenCalled();
    });

    it("toasts any other failure, with the error's own message, and resolves to undefined", async () => {
      const service = TestBed.inject(AuthService);
      sdk.signInWithPopup.mockRejectedValue(
        firebaseError("auth/popup-blocked", "Firebase: Error (auth/popup-blocked)."),
      );

      await expect(service.login()).resolves.toBeUndefined();

      expect(toast.error).toHaveBeenCalledExactlyOnceWith(
        "Login failed",
        "Firebase: Error (auth/popup-blocked).",
      );
    });

    it("toasts an error that is not an Error as unknown", async () => {
      const service = TestBed.inject(AuthService);
      sdk.signInWithPopup.mockRejectedValue("nope");

      await service.login();

      expect(toast.error).toHaveBeenCalledExactlyOnceWith("Login failed", "Unknown error");
    });
  });

  describe("logout and the ID token", () => {
    it("signs out of Firebase and says goodbye", async () => {
      const service = TestBed.inject(AuthService);
      sdk.signOut.mockResolvedValue(undefined);

      await service.logout();

      expect(sdk.signOut).toHaveBeenCalledExactlyOnceWith(AUTH);
      expect(toast.info).toHaveBeenCalledExactlyOnceWith("Logged out", expect.any(String));
    });

    it("hands out the signed-in user's ID token, and none when signed out", async () => {
      const service = TestBed.inject(AuthService);
      expect(await service.idToken()).toBeNull();

      registered().next(user("u1"));
      await service.whenReady;

      expect(await service.idToken()).toBe("token-of-u1");
    });
  });
});
