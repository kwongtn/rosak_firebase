import { ErrorHandler, provideZonelessChangeDetection, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastService } from "../../ui/toast/toast.service";
import { AuthService } from "../auth/auth.service";
import { GraphQLClient, GraphQLRequestError } from "../graphql/graphql-client";
import { PUSH_STORAGE_KEY, readPushState, writePushState } from "./push-storage";
import {
  PUSH_SUBSCRIPTION_QUERY,
  REGISTER_PUSH_TOKEN_MUTATION,
  UNREGISTER_PUSH_TOKEN_MUTATION,
} from "./push.queries";
import { FCM_VAPID_KEY } from "./push-loader";
import { PUSH_SUPPORT, PushService, PushSupport, browserPushSupport } from "./push.service";

// The unit-test builder shares one module cache across spec files (`isolate: false`), so reset it on
// both sides of this file; see "Unit-test isolation" in docs/COMPONENTS.md.
vi.hoisted(() => vi.resetModules());

const sdk = vi.hoisted(() => ({
  isSupported: vi.fn(),
  getMessaging: vi.fn(),
  getToken: vi.fn(),
  onMessage: vi.fn(),
}));
const app = vi.hoisted(() => ({ getApps: vi.fn(), initializeApp: vi.fn() }));

vi.mock("firebase/messaging", () => sdk);
vi.mock("firebase/app", () => app);

afterAll(() => vi.resetModules());

const KJL = { id: "1", code: "KJL" };
const AGL = { id: "2", code: "AGL" };
const HEADERS = { "firebase-auth-key": "id-token" };
const FIREBASE_APP = { name: "[DEFAULT]" };
const MESSAGING = { messaging: true };

/** What `request()` answers per document; a test replaces an entry to change one answer. */
type Answers = Record<string, () => Promise<unknown>>;

describe("PushService", () => {
  let answers: Answers;
  let request: ReturnType<typeof vi.fn>;
  let toast: {
    success: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
  };
  let handleError: ReturnType<typeof vi.fn>;
  let notification: {
    permission: NotificationPermission;
    requestPermission: ReturnType<typeof vi.fn>;
  };

  function create(
    options: { vapidKey?: string; support?: PushSupport; signedIn?: boolean } = {},
  ): PushService {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: FCM_VAPID_KEY, useValue: options.vapidKey ?? "vapid-key" },
        { provide: PUSH_SUPPORT, useValue: options.support ?? "supported" },
        {
          provide: AuthService,
          useValue: {
            idToken: async () => "id-token",
            isLoggedIn: signal(options.signedIn ?? true),
          },
        },
        { provide: GraphQLClient, useValue: { request } },
        { provide: ToastService, useValue: toast },
        { provide: ErrorHandler, useValue: { handleError } },
      ],
    });
    return TestBed.inject(PushService);
  }

  /** Every `request()` call for one document, as `[variables, headers, options]`. */
  function callsOf(query: string): unknown[][] {
    return request.mock.calls.filter(([sent]) => sent === query).map(([, ...rest]) => rest);
  }

  beforeEach(() => {
    localStorage.clear();
    answers = {
      [REGISTER_PUSH_TOKEN_MUTATION]: async () => ({ registerPushToken: { ok: true } }),
      [UNREGISTER_PUSH_TOKEN_MUTATION]: async () => ({ unregisterPushToken: { ok: true } }),
      [PUSH_SUBSCRIPTION_QUERY]: async () => ({ pushSubscription: null }),
    };
    request = vi.fn((query: string) => answers[query]());
    toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
    handleError = vi.fn();
    notification = { permission: "default", requestPermission: vi.fn(async () => "granted") };
    vi.stubGlobal("Notification", notification);
    sdk.isSupported.mockResolvedValue(true);
    sdk.getMessaging.mockReturnValue(MESSAGING);
    sdk.getToken.mockResolvedValue("fcm-token");
    app.getApps.mockReturnValue([FIREBASE_APP]);
  });

  afterEach(async () => {
    // A subscribe ends by starting the foreground listener without awaiting it; let it land here,
    // not in the next test's mock calls.
    await new Promise((resolve) => setTimeout(resolve, 0));
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe("availability", () => {
    it("is unconfigured without a VAPID key, whatever the browser can do", () => {
      expect(create({ vapidKey: "  " }).availability()).toBe("unconfigured");
    });

    it("passes the browser's own answer through: install on an iOS tab, or unsupported", () => {
      expect(create({ support: "install" }).availability()).toBe("install");
      TestBed.resetTestingModule();
      expect(create({ support: "unsupported" }).availability()).toBe("unsupported");
    });

    it("is blocked once notifications are denied, and needs the prompt only before an answer", () => {
      notification.permission = "denied";
      const blocked = create();
      expect(blocked.availability()).toBe("blocked");
      expect(blocked.needsPermission()).toBe(false);

      TestBed.resetTestingModule();
      notification.permission = "default";
      const fresh = create();
      expect(fresh.availability()).toBe("ready");
      expect(fresh.needsPermission()).toBe(true);
    });

    it("needs a signed-in rider, after everything the browser decides", async () => {
      const push = create({ signedIn: false });
      expect(push.availability()).toBe("signed-out");

      await push.subscribe(KJL);
      expect(notification.requestPermission).not.toHaveBeenCalled();

      TestBed.resetTestingModule();
      notification.permission = "denied";
      expect(create({ signedIn: false }).availability()).toBe("blocked");
    });
  });

  describe("another tab", () => {
    /** What this tab sees when another tab of the app writes `value` (null: removes) to the key. */
    function otherTabWrites(value: string | null, key: string | null = PUSH_STORAGE_KEY): void {
      if (key !== null) {
        if (value === null) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, value);
        }
      }
      window.dispatchEvent(new StorageEvent("storage", { key, newValue: value }));
    }

    it("takes a sign-out there: this tab's lines go, and the next account here starts clean", () => {
      writePushState({ token: "fcm-token", lines: [KJL] });
      const push = create();
      expect(push.lines()).toEqual([KJL]);

      otherTabWrites(null);

      expect(push.lines()).toEqual([]);
      expect(push.isSubscribed("1")).toBe(false);
    });

    it("takes a change of lines made there, and a cleared storage", () => {
      writePushState({ token: "fcm-token", lines: [KJL] });
      const push = create();

      otherTabWrites(JSON.stringify({ token: "fcm-token", lines: [KJL, AGL] }));
      expect(push.lines()).toEqual([KJL, AGL]);

      localStorage.clear();
      otherTabWrites(null, null);
      expect(push.lines()).toEqual([]);
    });

    it("ignores the other keys", () => {
      writePushState({ token: "fcm-token", lines: [KJL] });
      const push = create();

      localStorage.removeItem(PUSH_STORAGE_KEY);
      otherTabWrites("{}", "rosak:preferences:v1");

      expect(push.lines()).toEqual([KJL]);
    });
  });

  describe("subscribe (the token flow)", () => {
    it("asks for permission in the same tick as the tap, then registers the token for the line", async () => {
      const push = create();

      const done = push.subscribe(KJL);
      // Before any await: the prompt needs the tap's user activation.
      expect(notification.requestPermission).toHaveBeenCalledTimes(1);
      await done;

      expect(app.getApps).toHaveBeenCalled();
      expect(sdk.getMessaging).toHaveBeenCalledExactlyOnceWith(FIREBASE_APP);
      expect(sdk.getToken).toHaveBeenCalledExactlyOnceWith(MESSAGING, { vapidKey: "vapid-key" });
      expect(callsOf(REGISTER_PUSH_TOKEN_MUTATION)).toEqual([
        [{ token: "fcm-token", lineIds: ["1"] }, HEADERS],
      ]);
      expect(push.lines()).toEqual([KJL]);
      expect(push.isSubscribed("1")).toBe(true);
      expect(readPushState()).toEqual({ token: "fcm-token", lines: [KJL] });
      expect(toast.success).toHaveBeenCalledWith(
        "Alerts on for KJL",
        "This browser will tell you when KJL has a major incident.",
      );
      expect(push.needsPermission()).toBe(false);
    });

    it("sends the full list when a second line is added, without asking again", async () => {
      notification.permission = "granted";
      writePushState({ token: "fcm-token", lines: [KJL] });
      const push = create();

      await push.subscribe(AGL);

      expect(notification.requestPermission).not.toHaveBeenCalled();
      expect(callsOf(REGISTER_PUSH_TOKEN_MUTATION)).toEqual([
        [{ token: "fcm-token", lineIds: ["1", "2"] }, HEADERS],
      ]);
      expect(readPushState()?.lines).toEqual([KJL, AGL]);
    });

    it("stores a refreshed token in place of the old one", async () => {
      notification.permission = "granted";
      writePushState({ token: "old-token", lines: [KJL] });
      sdk.getToken.mockResolvedValue("new-token");
      const push = create();

      await push.subscribe(AGL);

      expect(callsOf(REGISTER_PUSH_TOKEN_MUTATION)).toEqual([
        [{ token: "new-token", lineIds: ["1", "2"] }, HEADERS],
      ]);
      expect(readPushState()?.token).toBe("new-token");
    });

    it("does nothing more when notifications are denied, and the bell turns to blocked", async () => {
      notification.requestPermission.mockResolvedValue("denied");
      const push = create();

      await push.subscribe(KJL);

      expect(sdk.getToken).not.toHaveBeenCalled();
      expect(request).not.toHaveBeenCalled();
      expect(push.availability()).toBe("blocked");
      expect(readPushState()).toBeNull();
    });

    it("leaves the state alone when the prompt is dismissed without an answer", async () => {
      notification.requestPermission.mockResolvedValue("default");
      const push = create();

      await push.subscribe(KJL);

      expect(request).not.toHaveBeenCalled();
      expect(push.availability()).toBe("ready");
      expect(push.needsPermission()).toBe(true);
    });

    it("tells the rider when the SDK says this browser cannot do web push", async () => {
      sdk.isSupported.mockResolvedValue(false);
      const push = create();

      await push.subscribe(KJL);

      expect(sdk.getToken).not.toHaveBeenCalled();
      expect(request).not.toHaveBeenCalled();
      expect(push.availability()).toBe("unsupported");
      expect(toast.error).toHaveBeenCalledWith(
        "Alerts don't work in this browser",
        "Try another browser, or the app.",
      );
    });

    it("reads the permission again first: a site reset to 'ask' since load asks inside the tap", async () => {
      notification.permission = "granted";
      const push = create();
      expect(push.needsPermission()).toBe(false);
      notification.permission = "default";

      const done = push.subscribe(KJL);
      expect(notification.requestPermission).toHaveBeenCalledTimes(1);
      await done;

      expect(readPushState()).toEqual({ token: "fcm-token", lines: [KJL] });
    });

    it("turns blocked without asking when the site was blocked since load", async () => {
      const push = create();
      notification.permission = "denied";

      await push.subscribe(KJL);

      expect(notification.requestPermission).not.toHaveBeenCalled();
      expect(request).not.toHaveBeenCalled();
      expect(push.availability()).toBe("blocked");
    });

    it("never asks or sends while alerts cannot work here", async () => {
      const push = create({ vapidKey: "" });

      await push.subscribe(KJL);

      expect(notification.requestPermission).not.toHaveBeenCalled();
      expect(request).not.toHaveBeenCalled();
    });

    it("keeps the state and leaves the toast to GraphQLClient when the backend refuses", async () => {
      answers[REGISTER_PUSH_TOKEN_MUTATION] = async () => {
        throw new GraphQLRequestError([{ message: "Unknown line" }]);
      };
      const push = create();

      await push.subscribe(KJL);

      expect(push.lines()).toEqual([]);
      expect(readPushState()).toBeNull();
      expect(toast.error).not.toHaveBeenCalled();
      expect(handleError).not.toHaveBeenCalled();
      expect(push.busy()).toBe(false);
    });

    it("toasts and reports any other failure, such as a failed token request", async () => {
      const failure = new Error("messaging/token-subscribe-failed");
      sdk.getToken.mockRejectedValue(failure);
      const push = create();

      await push.subscribe(KJL);

      expect(toast.error).toHaveBeenCalledWith(
        "Couldn't turn on alerts",
        "Check your connection and try again.",
      );
      expect(handleError).toHaveBeenCalledExactlyOnceWith(failure);
      expect(readPushState()).toBeNull();
    });

    it("treats ok: false from the backend as a failure", async () => {
      answers[REGISTER_PUSH_TOKEN_MUTATION] = async () => ({ registerPushToken: { ok: false } });
      const push = create();

      await push.subscribe(KJL);

      expect(readPushState()).toBeNull();
      expect(handleError).toHaveBeenCalledTimes(1);
    });
  });

  describe("unsubscribe and turnOff", () => {
    beforeEach(() => {
      notification.permission = "granted";
      writePushState({ token: "fcm-token", lines: [KJL, AGL] });
    });

    it("re-registers the lines that are left", async () => {
      const push = create();

      await push.unsubscribe("1");

      expect(callsOf(REGISTER_PUSH_TOKEN_MUTATION)).toEqual([
        [{ token: "fcm-token", lineIds: ["2"] }, HEADERS],
      ]);
      expect(readPushState()).toEqual({ token: "fcm-token", lines: [AGL] });
      expect(toast.success).toHaveBeenCalledWith("Alerts off for KJL");
    });

    it("unregisters the token once the last line goes, and stores nothing", async () => {
      writePushState({ token: "fcm-token", lines: [KJL] });
      const push = create();

      await push.unsubscribe("1");

      expect(callsOf(REGISTER_PUSH_TOKEN_MUTATION)).toEqual([]);
      expect(callsOf(UNREGISTER_PUSH_TOKEN_MUTATION)).toEqual([[{ token: "fcm-token" }, HEADERS]]);
      expect(localStorage.getItem(PUSH_STORAGE_KEY)).toBeNull();
      expect(push.lines()).toEqual([]);
    });

    it("ignores a line without alerts", async () => {
      const push = create();

      await push.unsubscribe("99");

      expect(request).not.toHaveBeenCalled();
    });

    it("turns everything off with one unregister", async () => {
      const push = create();

      await push.turnOff();

      expect(callsOf(UNREGISTER_PUSH_TOKEN_MUTATION)).toEqual([[{ token: "fcm-token" }, HEADERS]]);
      expect(readPushState()).toBeNull();
      expect(toast.success).toHaveBeenCalledWith(
        "Alerts turned off",
        "This browser will not get line alerts any more.",
      );
    });

    it("keeps the lines when turning off fails, so the rider can try again", async () => {
      const failure = new Error("Http failure response: 0 Unknown Error");
      answers[UNREGISTER_PUSH_TOKEN_MUTATION] = async () => {
        throw failure;
      };
      const push = create();

      await push.turnOff();

      expect(push.lines()).toEqual([KJL, AGL]);
      expect(readPushState()?.lines).toEqual([KJL, AGL]);
      expect(toast.error).toHaveBeenCalledWith(
        "Couldn't turn off alerts",
        "Check your connection and try again.",
      );
      expect(handleError).toHaveBeenCalledExactlyOnceWith(failure);
    });
  });

  describe("resume (restore from pushSubscription)", () => {
    beforeEach(() => {
      notification.permission = "granted";
      writePushState({ token: "fcm-token", lines: [KJL] });
    });

    it("reads the subscription once and takes the backend's lines", async () => {
      answers[PUSH_SUBSCRIPTION_QUERY] = async () => ({
        pushSubscription: { token: "fcm-token", lines: [AGL] },
      });
      const push = create();

      await push.resume();

      expect(callsOf(PUSH_SUBSCRIPTION_QUERY)).toEqual([
        [{ token: "fcm-token" }, HEADERS, { quiet: true }],
      ]);
      expect(push.lines()).toEqual([AGL]);
      expect(readPushState()).toEqual({ token: "fcm-token", lines: [AGL] });
    });

    it("clears the alerts when the backend does not know the token for this account", async () => {
      const push = create();

      await push.resume();

      expect(push.lines()).toEqual([]);
      expect(readPushState()).toBeNull();
    });

    it("keeps the stored lines and reports a failed read", async () => {
      const failure = new Error("Http failure response: 502");
      answers[PUSH_SUBSCRIPTION_QUERY] = async () => {
        throw failure;
      };
      const push = create();

      await push.resume();

      expect(push.lines()).toEqual([KJL]);
      expect(handleError).toHaveBeenCalledExactlyOnceWith(failure);
    });

    it("does not read offline", async () => {
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
      const push = create();

      await push.resume();

      expect(request).not.toHaveBeenCalled();
      expect(push.lines()).toEqual([KJL]);
    });

    it("lets a change the rider made during the read win over its answer", async () => {
      // Not yet granted, so the resume starts no foreground listener: two concurrent dynamic imports
      // of a vi.mock'ed module can hand the second one the real module in this runner.
      notification.permission = "default";
      let answer: (value: unknown) => void = () => undefined;
      answers[PUSH_SUBSCRIPTION_QUERY] = () => new Promise((resolve) => (answer = resolve));
      const push = create();

      const resuming = push.resume();
      await push.subscribe(AGL);
      answer({ pushSubscription: { token: "fcm-token", lines: [KJL] } });
      await resuming;

      expect(push.lines()).toEqual([KJL, AGL]);
    });

    it("does nothing for a browser without alerts", async () => {
      localStorage.clear();
      const push = create();

      await push.resume();

      expect(request).not.toHaveBeenCalled();
      expect(sdk.onMessage).not.toHaveBeenCalled();
    });
  });

  describe("alerts in a visible tab", () => {
    it("toasts a foreground message with its title, body and link, listening once", async () => {
      notification.permission = "granted";
      writePushState({ token: "fcm-token", lines: [KJL] });
      const push = create();

      await push.resume();
      await push.resume();
      await vi.waitFor(() => expect(sdk.onMessage).toHaveBeenCalledTimes(1));

      const [messaging, next] = sdk.onMessage.mock.calls[0] as [
        unknown,
        (payload: unknown) => void,
      ];
      expect(messaging).toBe(MESSAGING);
      next({
        notification: { title: "KJL: Signal fault", body: "Trains held at KLCC" },
        fcmOptions: { link: "https://app.example/insiden/2026-10-22" },
      });
      expect(toast.info).toHaveBeenCalledWith("KJL: Signal fault", "Trains held at KLCC", {
        label: "Open",
        href: "https://app.example/insiden/2026-10-22",
      });

      next({});
      expect(toast.info).toHaveBeenLastCalledWith("Line alert", undefined, undefined);
    });
  });

  describe("forget (before sign-out)", () => {
    it("clears the alerts at once and unregisters the token without waiting for it", async () => {
      writePushState({ token: "fcm-token", lines: [KJL] });
      let settle: (value: unknown) => void = () => undefined;
      answers[UNREGISTER_PUSH_TOKEN_MUTATION] = () => new Promise((resolve) => (settle = resolve));
      const push = create();

      await push.forget();

      expect(push.lines()).toEqual([]);
      expect(readPushState()).toBeNull();
      expect(callsOf(UNREGISTER_PUSH_TOKEN_MUTATION)).toEqual([
        [{ token: "fcm-token" }, HEADERS, { quiet: true }],
      ]);
      settle({ unregisterPushToken: { ok: true } });
    });

    it("reports a failed unregister after the fact", async () => {
      writePushState({ token: "fcm-token", lines: [KJL] });
      const failure = new Error("Http failure response: 0 Unknown Error");
      answers[UNREGISTER_PUSH_TOKEN_MUTATION] = async () => {
        throw failure;
      };
      const push = create();

      await push.forget();

      await vi.waitFor(() => expect(handleError).toHaveBeenCalledExactlyOnceWith(failure));
    });
  });
});

describe("push storage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("round-trips the token and lines, and clears them for null", () => {
    writePushState({ token: "t", lines: [KJL] });
    expect(readPushState()).toEqual({ token: "t", lines: [KJL] });

    writePushState(null);
    expect(localStorage.getItem(PUSH_STORAGE_KEY)).toBeNull();
    expect(readPushState()).toBeNull();
  });

  it.each([
    ["corrupt JSON", "{"],
    ["a non-object", "42"],
    ["no token", JSON.stringify({ lines: [KJL] })],
    ["an empty token", JSON.stringify({ token: "", lines: [KJL] })],
    ["no lines", JSON.stringify({ token: "t", lines: [] })],
    ["a line without a code", JSON.stringify({ token: "t", lines: [{ id: "1" }] })],
  ])("reads %s as nothing stored", (_label, raw) => {
    localStorage.setItem(PUSH_STORAGE_KEY, raw);
    expect(readPushState()).toBeNull();
  });

  it("survives storage that throws on every access", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage is disabled", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    expect(readPushState()).toBeNull();
    expect(() => writePushState({ token: "t", lines: [KJL] })).not.toThrow();
  });
});

describe("browserPushSupport", () => {
  const withPush = { Notification: {}, PushManager: {} };

  it("needs Notification, a service worker container and the Push API", () => {
    expect(browserPushSupport({ serviceWorker: {} } as unknown as Navigator, withPush)).toBe(
      "supported",
    );
    expect(browserPushSupport({} as Navigator, withPush)).toBe("unsupported");
    expect(
      browserPushSupport({ serviceWorker: {} } as unknown as Navigator, { Notification: {} }),
    ).toBe("unsupported");
  });

  it("asks for the Home Screen app in an iOS Safari tab, and not in the installed app", () => {
    const tab = { standalone: false, maxTouchPoints: 5 } as unknown as Navigator;
    expect(browserPushSupport(tab, {})).toBe("install");
    expect(
      browserPushSupport(
        { standalone: true, maxTouchPoints: 5, serviceWorker: {} } as unknown as Navigator,
        withPush,
      ),
    ).toBe("supported");
  });

  it("leaves a Mac's Safari tab alone, which has web push without installing", () => {
    expect(
      browserPushSupport(
        { standalone: false, maxTouchPoints: 0, serviceWorker: {} } as unknown as Navigator,
        withPush,
      ),
    ).toBe("supported");
  });
});
