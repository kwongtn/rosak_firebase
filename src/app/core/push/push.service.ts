import { ErrorHandler, Injectable, InjectionToken, computed, inject, signal } from "@angular/core";
import { getApps, initializeApp } from "firebase/app";
import type { MessagePayload } from "firebase/messaging";

import { environment } from "../../../environments/environment";
import { ToastService } from "../../ui/toast/toast.service";
import { AuthService } from "../auth/auth.service";
import { injectIsBrowser } from "../composables/is-browser";
import { GraphQLClient, GraphQLRequestError } from "../graphql/graphql-client";
import { FCM_VAPID_KEY } from "./push-loader";
import { PushLine, StoredPushState, readPushState, writePushState } from "./push-storage";
import {
  PUSH_SUBSCRIPTION_QUERY,
  PushSubscriptionData,
  PushSubscriptionVars,
  REGISTER_PUSH_TOKEN_MUTATION,
  RegisterPushTokenData,
  RegisterPushTokenVars,
  UNREGISTER_PUSH_TOKEN_MUTATION,
  UnregisterPushTokenData,
  UnregisterPushTokenVars,
} from "./push.queries";

/**
 * What the alert controls can offer here, most blocking first: `unconfigured` (no VAPID key in this
 * build), `install` (a browser tab on iOS or iPadOS: web push there needs the app on the Home
 * Screen), `unsupported` (no Notification, service worker or Push API, or the SDK said no), `blocked`
 * (the rider denied notifications for this site), `signed-out` (the backend keeps alerts per
 * account), else `ready`.
 */
export type PushAvailability =
  "unconfigured" | "install" | "unsupported" | "blocked" | "signed-out" | "ready";

export type PushSupport = "supported" | "install" | "unsupported";

/** What a browser can do for web push, before the SDK's own async `isSupported()` is asked. */
export function browserPushSupport(nav: Navigator, scope: object): PushSupport {
  // WebKit on iOS and iPadOS defines `navigator.standalone`, and `false` there is a browser tab. The
  // touch test keeps a Mac out, whose Safari has web push in a tab (an iPad reports itself as a Mac).
  if (
    (nav as Navigator & { standalone?: boolean }).standalone === false &&
    nav.maxTouchPoints > 0
  ) {
    return "install";
  }
  return "Notification" in scope && "serviceWorker" in nav && "PushManager" in scope
    ? "supported"
    : "unsupported";
}

/** This browser's {@link browserPushSupport}, `unsupported` on the server. A token for specs. */
export const PUSH_SUPPORT = new InjectionToken<PushSupport>("PUSH_SUPPORT", {
  providedIn: "root",
  factory: () => (injectIsBrowser() ? browserPushSupport(navigator, globalThis) : "unsupported"),
});

function firebaseApp() {
  return getApps().length ? getApps()[0] : initializeApp(environment.firebase);
}

/**
 * Web push alerts for a rider's lines (audit F294): the backend sends one FCM message when a MAJOR
 * incident on a subscribed line is approved, at most once per line in 30 minutes.
 *
 * This browser's FCM token and the lines registered with it live in `localStorage`
 * (`push-storage.ts`), so the bells and the profile's Alerts card know their state without a read.
 * Every change sends the FULL line list (`registerPushToken` replaces it), or `unregisterPushToken`
 * once the list is empty, and stores the answer only after the backend took it.
 *
 * This file is itself a dynamic `import()`: the alert controls reach the service through
 * `injectPushService()` (`push-loader.ts`, which loads nothing in a build without a VAPID key), and
 * `AuthService` drives the two session hooks through its own: `resume()` after a sign-in when a token
 * is stored, `forget()` before a sign-out. Firebase Messaging is a further dynamic `import()` on
 * first use (a tap on Allow, or a session that already has alerts), so nobody downloads it before
 * they want alerts, and none of it reaches `main`.
 *
 * Rider actions never throw: a failure is toasted (GraphQLClient toasts its own) and reported, and
 * the stored state is left as it was, so the bell keeps telling the truth.
 */
@Injectable({ providedIn: "root" })
export class PushService {
  private readonly auth = inject(AuthService);
  private readonly graphql = inject(GraphQLClient);
  private readonly toast = inject(ToastService);
  private readonly errorHandler = inject(ErrorHandler);
  private readonly vapidKey = inject(FCM_VAPID_KEY);

  private readonly _state = signal<StoredPushState | null>(null);
  private readonly _support = signal<PushSupport>("unsupported");
  private readonly _permission = signal<NotificationPermission>("default");
  private readonly _busy = signal(false);
  /** Bumped by every stored change, so a restore that answers after one cannot undo it. */
  private _changes = 0;
  private _listening = false;

  /** The lines this browser has alerts for. */
  readonly lines = computed(() => this._state()?.lines ?? []);
  /** True while a rider action is talking to the browser, FCM or the backend. */
  readonly busy = this._busy.asReadonly();
  readonly availability = computed<PushAvailability>(() => {
    if (this.vapidKey.trim() === "") {
      return "unconfigured";
    }
    const support = this._support();
    if (support !== "supported") {
      return support;
    }
    if (this._permission() === "denied") {
      return "blocked";
    }
    return this.auth.isLoggedIn() ? "ready" : "signed-out";
  });
  /** True until the rider has answered the browser's prompt: the bell shows the pre-prompt first. */
  readonly needsPermission = computed(() => this._permission() === "default");
  /** Resolves once the session is known, before which `signed-out` may only mean "not restored yet". */
  readonly whenReady: Promise<void> = this.auth.whenReady;

  constructor() {
    if (!injectIsBrowser()) {
      return;
    }
    this._state.set(readPushState());
    this._support.set(inject(PUSH_SUPPORT));
    if (this._support() === "supported") {
      this._permission.set(Notification.permission);
    }
  }

  isSubscribed(lineId: string): boolean {
    return this.lines().some((line) => line.id === lineId);
  }

  /**
   * Turns alerts on for `line`: the pre-prompt's Allow, or the bell once notifications are allowed.
   * The browser is asked before the first `await`, because its prompt needs the tap's user
   * activation, which an awaited import or request would use up.
   */
  async subscribe(line: PushLine): Promise<void> {
    if (this._busy() || this.availability() !== "ready") {
      return;
    }
    const permission =
      this._permission() === "granted"
        ? Promise.resolve<NotificationPermission>("granted")
        : Notification.requestPermission();
    await this.run("Couldn't turn on alerts", async () => {
      const answer = await permission;
      this._permission.set(answer);
      if (answer !== "granted") {
        // "denied" turns the bell into the blocked hint; a dismissed prompt changes nothing.
        return;
      }
      const token = await this.token();
      if (token === null) {
        return;
      }
      await this.register(token, [...this.lines().filter((other) => other.id !== line.id), line]);
      this.toast.success(
        `Alerts on for ${line.code}`,
        `This browser will tell you when ${line.code} has a major incident.`,
      );
      this.listen();
    });
  }

  /** Turns alerts off for one line: the bell on a line that has them, or a chip on the profile. */
  async unsubscribe(lineId: string): Promise<void> {
    const state = this._state();
    const removed = state?.lines.find((line) => line.id === lineId);
    if (this._busy() || !state || !removed) {
      return;
    }
    await this.run("Couldn't turn off alerts", async () => {
      const lines = state.lines.filter((line) => line.id !== lineId);
      await (lines.length > 0 ? this.register(state.token, lines) : this.unregister(state.token));
      this.toast.success(`Alerts off for ${removed.code}`);
    });
  }

  /** The profile's "Turn off all alerts". */
  async turnOff(): Promise<void> {
    const state = this._state();
    if (this._busy() || !state) {
      return;
    }
    await this.run("Couldn't turn off alerts", async () => {
      await this.unregister(state.token);
      this.toast.success("Alerts turned off", "This browser will not get line alerts any more.");
    });
  }

  /**
   * After a sign-in while this browser has alerts (`AuthService`): toasts the alerts that arrive while
   * a tab is visible, and restores the lines from the backend with ONE read. The backend's answer
   * wins, and `null` (a token it does not know, or one another account registered) clears them.
   * Offline, or when the read fails, the stored lines stand.
   */
  async resume(): Promise<void> {
    const state = this._state();
    if (!state) {
      return;
    }
    if (this._permission() === "granted") {
      this.listen();
    }
    if (navigator.onLine === false) {
      return;
    }
    const changes = this._changes;
    try {
      const data = await this.graphql.request<PushSubscriptionData, PushSubscriptionVars>(
        PUSH_SUBSCRIPTION_QUERY,
        { token: state.token },
        await this.authHeaders(),
        { quiet: true },
      );
      if (changes !== this._changes) {
        // The rider changed their alerts while the read was out; that change is newer.
        return;
      }
      const lines = data.pushSubscription?.lines ?? [];
      this.save(lines.length > 0 ? { token: state.token, lines } : null);
    } catch (err) {
      // GraphQLClient already reported a GraphQLRequestError.
      if (!(err instanceof GraphQLRequestError)) {
        this.errorHandler.handleError(err);
      }
    }
  }

  /**
   * Before a sign-out (`AuthService.logout`): forgets this browser's alerts at once and asks the
   * backend to drop the token, best effort. The request is not awaited, so a dead link cannot hold
   * the sign-out up; it carries an ID token minted while the session still exists.
   */
  async forget(): Promise<void> {
    const state = this._state();
    this.save(null);
    if (!state) {
      return;
    }
    const headers = await this.authHeaders();
    void this.graphql
      .request<UnregisterPushTokenData, UnregisterPushTokenVars>(
        UNREGISTER_PUSH_TOKEN_MUTATION,
        { token: state.token },
        headers,
        { quiet: true },
      )
      .catch((err: unknown) => {
        if (!(err instanceof GraphQLRequestError)) {
          this.errorHandler.handleError(err);
        }
      });
  }

  /** Runs one rider action with the busy flag up. A failure is toasted and reported, never thrown. */
  private async run(failure: string, action: () => Promise<void>): Promise<void> {
    this._busy.set(true);
    try {
      await action();
    } catch (err) {
      // GraphQLClient has already toasted and reported a GraphQLRequestError.
      if (!(err instanceof GraphQLRequestError)) {
        this.toast.error(failure, "Check your connection and try again.");
        this.errorHandler.handleError(err);
      }
    } finally {
      this._busy.set(false);
    }
  }

  private async register(token: string, lines: PushLine[]): Promise<void> {
    const data = await this.graphql.request<RegisterPushTokenData, RegisterPushTokenVars>(
      REGISTER_PUSH_TOKEN_MUTATION,
      { token, lineIds: lines.map((line) => line.id) },
      await this.authHeaders(),
    );
    if (!data.registerPushToken.ok) {
      throw new Error("registerPushToken answered ok: false");
    }
    this.save({ token, lines });
  }

  private async unregister(token: string): Promise<void> {
    const data = await this.graphql.request<UnregisterPushTokenData, UnregisterPushTokenVars>(
      UNREGISTER_PUSH_TOKEN_MUTATION,
      { token },
      await this.authHeaders(),
    );
    if (!data.unregisterPushToken.ok) {
      throw new Error("unregisterPushToken answered ok: false");
    }
    this.save(null);
  }

  private save(state: StoredPushState | null): void {
    this._changes++;
    this._state.set(state);
    writePushState(state);
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const idToken = await this.auth.idToken();
    return idToken ? { "firebase-auth-key": idToken } : {};
  }

  /** Firebase Messaging, imported on first use; `null` where the SDK says web push cannot work. */
  private async messaging() {
    const sdk = await import("firebase/messaging");
    if (!(await sdk.isSupported())) {
      this._support.set("unsupported");
      return null;
    }
    return { sdk, messaging: sdk.getMessaging(firebaseApp()) };
  }

  /** This browser's current FCM token, or `null` (told in a toast) where web push cannot work. */
  private async token(): Promise<string | null> {
    const loaded = await this.messaging();
    if (!loaded) {
      this.toast.error("Alerts don't work in this browser", "Try another browser, or the app.");
      return null;
    }
    // No serviceWorkerRegistration on purpose: the SDK registers /firebase-messaging-sw.js at its
    // default scope, /firebase-cloud-messaging-push-scope, apart from ngsw-worker.js at /, and waits
    // for it to activate. Asked on every subscribe, so the SDK's weekly token refresh happens.
    return loaded.sdk.getToken(loaded.messaging, { vapidKey: this.vapidKey });
  }

  /** A visible tab gets no system notification, so its alerts become toasts. Started once a page. */
  private listen(): void {
    if (this._listening) {
      return;
    }
    this._listening = true;
    this.messaging()
      .then((loaded) => {
        loaded?.sdk.onMessage(loaded.messaging, (payload) => this.showInTab(payload));
      })
      .catch((err: unknown) => {
        this._listening = false;
        this.errorHandler.handleError(err);
      });
  }

  private showInTab(payload: MessagePayload): void {
    const link = payload.fcmOptions?.link;
    this.toast.info(
      payload.notification?.title ?? "Line alert",
      payload.notification?.body,
      link ? { label: "Open", href: link } : undefined,
    );
  }
}
