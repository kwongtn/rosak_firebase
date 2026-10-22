import {
  DestroyRef,
  ErrorHandler,
  InjectionToken,
  Injector,
  Signal,
  afterNextRender,
  inject,
  signal,
} from "@angular/core";

import { environment } from "../../../environments/environment";
import { injectIsBrowser } from "../composables/is-browser";
import type { PushService } from "./push.service";

/** The project's Web Push (VAPID) public key; empty while alerts are not set up. A token for specs. */
export const FCM_VAPID_KEY = new InjectionToken<string>("FCM_VAPID_KEY", {
  providedIn: "root",
  factory: () => environment.fcm.vapidKey,
});

/** True when this build carries a VAPID key, so the alert controls can work at all. */
export function injectPushConfigured(): boolean {
  return inject(FCM_VAPID_KEY).trim() !== "";
}

/**
 * The root {@link PushService} for an alert control (a line row's bell, the profile's Alerts card),
 * loaded after the first render by a dynamic `import()`, so neither the service nor Firebase
 * Messaging lands in the caller's chunk. `null` until it lands, on the server, and for good in a
 * build without a VAPID key: alerts cannot work there, so nothing is downloaded (and nothing else,
 * such as `AuthService`, is created on its behalf).
 *
 * Must be called in an injection context. A failed load goes to the `ErrorHandler`, which turns a
 * chunk that cannot load into the app's offline or new-version notice.
 */
export function injectPushService(): Signal<PushService | null> {
  const service = signal<PushService | null>(null);
  if (!injectIsBrowser() || !injectPushConfigured()) {
    return service.asReadonly();
  }
  const injector = inject(Injector);
  const errorHandler = inject(ErrorHandler);
  let destroyed = false;
  inject(DestroyRef).onDestroy(() => (destroyed = true));
  afterNextRender(() => {
    import("./push.service")
      .then(({ PushService }) => {
        // A control that is gone by now (a row that unpinned, a page left) must not reach into a
        // destroyed injector.
        if (!destroyed) {
          service.set(injector.get(PushService));
        }
      })
      .catch((err: unknown) => errorHandler.handleError(err));
  });
  return service.asReadonly();
}
