import { DestroyRef, Injectable, PLATFORM_ID, inject, signal } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import * as Sentry from "@sentry/angular";
import { buildInfo } from "../../../build-info";
import { ToastService } from "../../ui/toast/toast.service";
import { isChunkLoadError } from "./chunk-load-error.util";

/** Every 10 minutes — frequent enough that a deploy is noticed well within a session, not so
 * frequent it reads as polling the server aggressively for what's a genuinely rare event. */
const CHECK_INTERVAL_MS = 10 * 60 * 1000;

interface VersionManifest {
  hash: string;
}

/**
 * Polls the site's own `/version.json` (a plain static asset, regenerated at build time by
 * scripts/generate-build-info.mjs — see its own doc comment) and compares its `hash` against
 * `buildInfo.hash`, the one baked into the JS this page is already running. A mismatch means a
 * newer build has been deployed since this tab loaded — `hasNewVersion` flips true, and the nav
 * bar's own icon (see app-nav.component.ts) is what actually surfaces that to the user.
 *
 * Deliberately doesn't auto-reload: a page mid-interaction (e.g. filling in the report form)
 * silently reloading out from under someone would lose their work. `reloadForNewVersion()` is
 * only ever called from an explicit click.
 */
@Injectable({ providedIn: "root" })
export class NewVersionService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly hasNewVersion = signal(false);

  constructor() {
    if (!this.isBrowser) {
      return;
    }
    this.checkOnce();
    setInterval(() => this.checkOnce(), CHECK_INTERVAL_MS);
    this.listenForStaleChunkFailures();
  }

  private async checkOnce(): Promise<void> {
    if (this.hasNewVersion()) {
      // Already known and surfaced — no need to keep asking until the user actually acts
      // on it (reloadForNewVersion navigates away from this page entirely).
      return;
    }
    try {
      const response = await fetch("/version.json", { cache: "no-store" });
      if (!response.ok) {
        return;
      }
      const manifest = (await response.json()) as VersionManifest;
      if (manifest.hash && manifest.hash !== buildInfo.hash) {
        this.hasNewVersion.set(true);
      }
    } catch (err: unknown) {
      // Captured quietly, never swallowed and never user-facing: offline, or the request
      // otherwise failed — indistinguishable from "no new version" from here, and worth simply
      // trying again at the next interval. A transient network hiccup is nothing the user
      // needs to act on, so it goes to Sentry only.
      Sentry.captureException(err);
    }
  }

  /** Clears whatever's cacheable (harmless if there's nothing to clear — this app has no
   * service worker today, but this stays correct if one's ever added) and does a real
   * navigation-level reload, not just a signal reset, since the whole point is to load the
   * newly-deployed JS. */
  async reloadForNewVersion(): Promise<void> {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    window.location.reload();
  }

  /**
   * Second detection path alongside the /version.json poll: the moment a stale tab actually
   * *hits* the problem — a click lazy-loads a route whose hashed chunk no longer exists after
   * a deploy (404) — surface the same "update available" affordance immediately instead of
   * waiting up to ten minutes for the next poll. Two listeners because the failure reaches the
   * page two ways: the `<script>` tag's load error (capture phase — resource errors don't
   * bubble), and the rejected promise from the dynamic `import()` itself. Both are observed
   * read-only: nothing is prevented or stopped, so every non-chunk error still propagates
   * untouched to Angular's global-error bridge (provideBrowserGlobalErrorListeners) and on to
   * Sentry.
   */
  private listenForStaleChunkFailures(): void {
    const onError = (event: Event): void => {
      // Resource-load failures arrive as plain Events targeting the element — the signal is
      // the failing script's URL, not any message. Real JS exceptions keep their message.
      const scriptSrc = event.target instanceof HTMLScriptElement ? event.target.src : "";
      const message = scriptSrc || (event instanceof ErrorEvent ? event.message : "");
      if (message && isChunkLoadError(message)) {
        this.promptReloadForNewVersion();
      }
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent): void => {
      const reason: unknown = event.reason;
      const message =
        reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "";
      if (message && isChunkLoadError(message)) {
        this.promptReloadForNewVersion();
      }
    };
    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    });
  }

  /**
   * The prompt itself: flips `hasNewVersion` — which lights the nav bar's existing "Update
   * available" button, whose click is the actual reload path (`reloadForNewVersion()`) — and
   * fires a one-time toast explaining why. Deliberately a prompt, never a silent auto-reload:
   * the user may be mid-form, and losing that work to a background reload is worse than a
   * stale page.
   */
  private promptReloadForNewVersion(): void {
    if (this.hasNewVersion()) {
      // Already surfaced — by the poll or an earlier chunk failure — so the button is lit and
      // a second toast would just nag.
      return;
    }
    this.hasNewVersion.set(true);
    this.toast.info(
      "Update available",
      "A new version was deployed and part of this page couldn't load. Reload to continue.",
    );
  }
}
