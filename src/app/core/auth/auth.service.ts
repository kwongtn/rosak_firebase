import { ErrorHandler, Injectable, Injector, inject, signal } from "@angular/core";

import { getApps, initializeApp } from "firebase/app";
import {
  Auth,
  getAdditionalUserInfo,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from "firebase/auth";

import { injectIsBrowser } from "../composables/is-browser";
import { readPushState, writePushState } from "../push/push-storage";
import type { PushService } from "../push/push.service";
import { claimSessionDrafts, readStorageItem } from "../util/web-storage.util";
import { environment } from "../../../environments/environment";
import { ToastService } from "../../ui/toast/toast.service";

function firebaseApp() {
  return getApps().length ? getApps()[0] : initializeApp(environment.firebase);
}

/** Installed by the Playwright E2E suite (see e2e/helpers/auth.ts) so specs can
 * run guarded routes without a live Firebase project. Never set in production. */
export interface E2EAuthOverride {
  email: string;
  admin: boolean;
}

/** Keyed by uid (not a single flat key) so a browser that's ever signed into more than one
 * account doesn't show a stale given_name left over from a previous one. */
const firstNameStorageKey = (uid: string) => `auth:given-name:${uid}`;

/**
 * Signals-based wrapper over Firebase Auth, ported from src/app/services/auth.service.ts.
 * Deliberately SSR-safe by doing nothing on the server: viewing /spotting is fully public
 * (see archive/frontend-map/spotting.md Permissions), so rendering "logged out" server-side is
 * correct, not a shortcut — the real client picks up the real auth state after hydration.
 */
@Injectable({ providedIn: "root" })
export class AuthService {
  private readonly isBrowser = injectIsBrowser();
  private readonly toast = inject(ToastService);
  private readonly errorHandler = inject(ErrorHandler);
  private readonly injector = inject(Injector);
  private auth: Auth | undefined;

  private readonly userSignal = signal<User | null>(null);
  readonly user = this.userSignal.asReadonly();
  readonly isLoggedIn = signal(false);
  /** Firebase custom claim, ported from the old app's `hasCustomClaim("admin")` route guard. */
  readonly isAdmin = signal(false);
  /** The OAuth provider's own `given_name` — a real first name, not `displayName`'s first
   * *word* (which cuts a multi-word first name short). Only ever available from Google's own
   * profile payload, returned alongside a fresh interactive sign-in — Firebase's own ID token
   * doesn't carry it, so a session restored on reload (no fresh popup) has nothing to read it
   * from *unless* an earlier login already cached it here, keyed by uid, in localStorage. */
  readonly firstName = signal<string | null>(null);

  /** Resolves once Firebase has restored (or confirmed the absence of) a persisted session.
   * Route guards must await this before reading `isLoggedIn()` — otherwise a page refresh
   * while genuinely logged in would read the signal's initial `false` and redirect a real
   * user away before Firebase has had a chance to restore their session. */
  readonly whenReady: Promise<void>;
  private resolveReady!: () => void;

  constructor() {
    this.whenReady = new Promise((resolve) => (this.resolveReady = resolve));
    if (!this.isBrowser) {
      this.resolveReady();
      return;
    }
    const override = (globalThis as { __e2eAuthOverride__?: E2EAuthOverride }).__e2eAuthOverride__;
    if (override) {
      this.isLoggedIn.set(true);
      this.isAdmin.set(override.admin);
      this.resolveReady();
      return;
    }
    this.auth = getAuth(firebaseApp());
    onAuthStateChanged(
      this.auth,
      (user) => this.applyUser(user),
      (error) => {
        this.errorHandler.handleError(error);
        this.resolveReady();
      },
    );
  }

  /** Firebase's auth-state callback: publishes the user, then their admin claim. */
  private async applyUser(user: User | null): Promise<void> {
    this.userSignal.set(user);
    this.isLoggedIn.set(user !== null);
    // A report draft this tab saved for another account (or for one that just signed out) goes now.
    claimSessionDrafts(user?.uid ?? null);
    // Line alerts on this browser: check them against the backend and listen while a tab is open.
    if (user && readPushState()) {
      void this.withPush((push) => push.resume());
    }
    // Best-effort read: a storage access that throws must not stop `whenReady` either.
    this.firstName.set(user ? readStorageItem("local", firstNameStorageKey(user.uid)) : null);
    try {
      this.isAdmin.set(user !== null && (await user.getIdTokenResult()).claims["admin"] === true);
    } catch (err) {
      // Reading the claim can refresh the token, which fails offline once it has expired. Fail
      // closed and report it; the user is still signed in.
      this.isAdmin.set(false);
      this.errorHandler.handleError(err);
    } finally {
      // Always: a failed claim read must not leave every `whenReady` waiter (the route guards, the
      // report outbox) pending for good.
      this.resolveReady();
    }
  }

  /** Google-popup sign-in — the only login method the current app offers. Resolves to
   * `undefined` (after toasting the reason) rather than rejecting on failure — every call site
   * is a fire-and-forget button click, none of them await a result. No success toast: the
   * avatar expanding into "Welcome back, NAME" is itself the confirmation that login worked. */
  async login(): Promise<User | undefined> {
    if (!this.auth) {
      return undefined;
    }
    try {
      const result = await signInWithPopup(this.auth, new GoogleAuthProvider());
      const givenName = getAdditionalUserInfo(result)?.profile?.["given_name"];
      if (typeof givenName === "string" && givenName) {
        localStorage.setItem(firstNameStorageKey(result.user.uid), givenName);
        this.firstName.set(givenName);
      }
      return result.user;
    } catch (err) {
      // Closing the popup without signing in rejects with auth/popup-closed-by-user —
      // routine, not worth an error toast for what's really just "changed their mind."
      if (err instanceof Error && "code" in err && err.code === "auth/popup-closed-by-user") {
        return undefined;
      }
      this.toast.error("Login failed", err instanceof Error ? err.message : "Unknown error");
      return undefined;
    }
  }

  async logout(): Promise<void> {
    if (!this.auth) {
      return;
    }
    // Before signOut: unregistering the alert token needs the session that registered it.
    if (readPushState()) {
      await this.withPush((push) => push.forget());
      // Also when the push chunk failed to load: a signed-out browser keeps no alert state.
      writePushState(null);
    }
    await signOut(this.auth);
    this.toast.info("Logged out", "Hope to see you again soon!");
  }

  /**
   * Runs a session hook of the line alerts (`core/push`). A dynamic import, and only for a browser
   * that has alerts: `push.service.ts` imports this service, and a rider without alerts never
   * downloads the push code. A failure is reported and never blocks the sign-in or sign-out.
   */
  private async withPush(hook: (push: PushService) => Promise<void>): Promise<void> {
    try {
      const { PushService } = await import("../push/push.service");
      await hook(this.injector.get(PushService));
    } catch (err) {
      this.errorHandler.handleError(err);
    }
  }

  idToken(): Promise<string | null> {
    return this.userSignal()?.getIdToken() ?? Promise.resolve(null);
  }
}
