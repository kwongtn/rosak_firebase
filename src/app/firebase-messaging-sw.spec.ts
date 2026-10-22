import { describe, expect, it, vi } from "vitest";

import { messagingServiceWorker } from "../../scripts/firebase-messaging-sw.mjs";

const CONFIG = {
  apiKey: "key",
  authDomain: "example.firebaseapp.com",
  projectId: "example",
  storageBucket: "example.appspot.com",
  messagingSenderId: "123",
  appId: "1:123:web:abc",
  measurementId: "G-1",
};

const ORIGIN = "https://app.example";

/** A window client as `clients.matchAll` lists it. */
interface FakeClient {
  url: string;
  focus: ReturnType<typeof vi.fn>;
}

/**
 * Runs the generated worker against a stand-in worker scope and returns what it did at start-up,
 * plus a way to tap a notification. `self`, `importScripts` and `firebase` are the only globals the
 * worker reads, so they are passed in as the function's parameters.
 */
function runWorker(windows: FakeClient[] = []) {
  const order: string[] = [];
  const listeners = new Map<string, (event: unknown) => void>();
  const openWindow = vi.fn(async () => undefined);
  const scope = {
    location: { origin: ORIGIN },
    clients: { matchAll: vi.fn(async () => windows), openWindow },
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      order.push(`listener:${type}`);
      listeners.set(type, listener);
    },
  };
  const importScripts = vi.fn((url: string) => order.push(`import:${url}`));
  const firebase = {
    initializeApp: vi.fn(() => order.push("initializeApp")),
    messaging: vi.fn(() => order.push("messaging")),
  };
  new Function("self", "importScripts", "firebase", messagingServiceWorker(CONFIG, "12.3.4"))(
    scope,
    importScripts,
    firebase,
  );

  /** Taps a notification whose FCM payload carries `link`; resolves once the worker is done. */
  async function click(data: unknown) {
    let pending: Promise<unknown> = Promise.resolve();
    const event = {
      notification: { data, close: vi.fn() },
      stopImmediatePropagation: vi.fn(),
      waitUntil: (work: Promise<unknown>) => (pending = work),
    };
    listeners.get("notificationclick")?.(event);
    await pending;
    return event;
  }

  return { order, firebase, openWindow, click };
}

const alert = (link: string) => ({ FCM_MSG: { fcmOptions: { link } } });

describe("messagingServiceWorker (public/firebase-messaging-sw.js)", () => {
  it("loads the compat SDK of the installed version and starts messaging with the inlined config", () => {
    const { order, firebase } = runWorker();

    expect(order).toEqual([
      "import:https://www.gstatic.com/firebasejs/12.3.4/firebase-app-compat.js",
      "import:https://www.gstatic.com/firebasejs/12.3.4/firebase-messaging-compat.js",
      "listener:notificationclick",
      "initializeApp",
      "messaging",
    ]);
    expect(firebase.initializeApp).toHaveBeenCalledExactlyOnceWith(CONFIG);
  });

  it("opens the alert's link and stops the SDK's own click handler", async () => {
    const { click, openWindow } = runWorker();

    const event = await click(alert(`${ORIGIN}/insiden/2026-10-22`));

    expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
    expect(event.notification.close).toHaveBeenCalledTimes(1);
    expect(openWindow).toHaveBeenCalledExactlyOnceWith(`${ORIGIN}/insiden/2026-10-22`);
  });

  it("opens a link that FCM delivered as the notification's click_action", async () => {
    const { click, openWindow } = runWorker();

    const event = await click({
      FCM_MSG: { notification: { click_action: `${ORIGIN}/insiden/2026-10-22` } },
    });

    expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
    expect(openWindow).toHaveBeenCalledExactlyOnceWith(`${ORIGIN}/insiden/2026-10-22`);
  });

  it("focuses a tab that is already on the link instead of opening another", async () => {
    const tab = { url: `${ORIGIN}/insiden/2026-10-22`, focus: vi.fn(async () => undefined) };
    const { click, openWindow } = runWorker([{ url: `${ORIGIN}/`, focus: vi.fn() }, tab]);

    await click(alert(`${ORIGIN}/insiden/2026-10-22`));

    expect(tab.focus).toHaveBeenCalledTimes(1);
    expect(openWindow).not.toHaveBeenCalled();
  });

  it("opens a link on another origin as the same page on this one", async () => {
    // A staging site whose backend still names the production FRONTEND_BASE_URL, for example.
    const tab = { url: `${ORIGIN}/insiden/2026-10-22`, focus: vi.fn(async () => undefined) };
    const { click, openWindow } = runWorker([tab]);

    const event = await click(alert("https://community.example/insiden/2026-10-22"));
    expect(event.notification.close).toHaveBeenCalledTimes(1);
    expect(tab.focus).toHaveBeenCalledTimes(1);

    await click(alert("https://elsewhere.example/phish?x=1#y"));
    expect(openWindow).toHaveBeenCalledExactlyOnceWith(`${ORIGIN}/phish?x=1#y`);
  });

  it("never opens another site, even for a path that starts with //", async () => {
    const { click, openWindow } = runWorker();

    await click(alert("https://community.example//elsewhere.example/phish"));

    const [opened] = openWindow.mock.calls[0] as unknown as [string];
    expect(new URL(opened).origin).toBe(ORIGIN);
    expect(opened).toBe(`${ORIGIN}//elsewhere.example/phish`);
  });

  it("leaves a notification without an FCM link to the other handlers", async () => {
    const { click, openWindow } = runWorker();

    const event = await click({ somethingElse: true });

    expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
    expect(event.notification.close).not.toHaveBeenCalled();
    expect(openWindow).not.toHaveBeenCalled();
  });
});
