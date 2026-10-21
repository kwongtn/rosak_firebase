import { DestroyRef, Injectable, inject, signal } from "@angular/core";

import { injectIsBrowser } from "../composables/is-browser";

/**
 * Whether the browser reports a network connection: `navigator.onLine` at startup, then kept
 * current by the window's `online`/`offline` events. `false` is reliable (no network at all);
 * `true` only means a network exists, not that the API answers, so a failed request while
 * "online" is still an ordinary error. Always `true` on the server, so the server HTML never
 * carries an offline state.
 */
@Injectable({ providedIn: "root" })
export class OnlineService {
  private readonly _isOnline = signal(true);
  readonly isOnline = this._isOnline.asReadonly();

  constructor() {
    if (!injectIsBrowser()) {
      return;
    }
    this._isOnline.set(navigator.onLine);
    const onChange = (event: Event): void => this._isOnline.set(event.type === "online");
    window.addEventListener("online", onChange);
    window.addEventListener("offline", onChange);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener("online", onChange);
      window.removeEventListener("offline", onChange);
    });
  }
}
