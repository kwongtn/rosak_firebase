import { DestroyRef, Injectable, inject, signal } from "@angular/core";

import * as Sentry from "@sentry/angular";
import { injectIsBrowser } from "../composables/is-browser";
import { OnlineService } from "../network/online.service";
import { buildInfo } from "../../../build-info";
import { ToastService } from "../../ui/toast/toast.service";
import { isChunkLoadError } from "./chunk-load-error.util";
import { isSameCommit } from "./version.util";

/** Every 10 minutes — frequent enough that a deploy is noticed well within a session, not so
 * frequent it reads as polling the server aggressively for what's a genuinely rare event. */
const CHECK_INTERVAL_MS = 10 * 60 * 1000;

/** How long a failed chunk waits for `/version.json` before the connection counts as down. */
const PROBE_TIMEOUT_MS = 5000;

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
  private readonly isBrowser = injectIsBrowser();
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly online = inject(OnlineService);

  readonly hasNewVersion = signal(false);

  /** A failed chunk's `/version.json` probe is in flight (see promptReloadForNewVersion). */
  private probing = false;

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
    if (!this.online.isOnline()) {
      // The request would only fail and add a Sentry event; the next interval asks again.
      return;
    }
    try {
      if (await this.isNewVersionDeployed()) {
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

  /** Whether the server's own `/version.json` names a different build from the one running here.
   * `no-store` skips the HTTP cache and `ngsw-bypass` skips the service worker (ngsw-config.json
   * caches no JSON either way). A non-OK answer or a missing hash counts as no. Rejects when the
   * request fails. */
  private async isNewVersionDeployed(signal?: AbortSignal): Promise<boolean> {
    const response = await fetch("/version.json", {
      cache: "no-store",
      headers: { "ngsw-bypass": "true" },
      signal,
    });
    if (!response.ok) {
      return false;
    }
    const manifest = (await response.json()) as VersionManifest;
    return !!manifest.hash && !isSameCommit(manifest.hash, buildInfo.hash);
  }

  /** Clears Cache Storage (the service worker's precache included: the worker re-fetches what it
   * needs, and navigations always try the network first, so the reload gets the new deploy's SSR
   * HTML) and does a real navigation-level reload, not just a signal reset, since the whole point
   * is to load the newly-deployed JS.
   *
   * Offline it only says so: with no connection the reload would fail, and the cleared caches
   * would take the offline copy of the app with them. */
  async reloadForNewVersion(): Promise<void> {
    if (!this.online.isOnline()) {
      this.toast.info("You're offline", "Reconnect to load the new version.");
      return;
    }
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
      // Only our own chunks 404 after a deploy: a blocked third-party script (ad blocker,
      // tracking protection) is not a new version, so it must not raise the prompt.
      if (scriptSrc && new URL(scriptSrc, location.href).origin !== location.origin) {
        return;
      }
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
   *
   * Public so the AppErrorHandler can call it: a chunk 404 inside a lazy-loaded route reaches
   * Angular's router first, which forwards it to ErrorHandler — never surfacing as an
   * `unhandledrejection` (see listenForStaleChunkFailures). Both paths end up here.
   *
   * A failed chunk alone is no evidence of a deploy. Offline the toast says the page needs a
   * connection, on every failed attempt, so a tap that goes nowhere always says why. Online it
   * first asks `/version.json`: in a tunnel the connection often reports "up" but carries nothing,
   * so only a different build there lights the update button.
   */
  promptReloadForNewVersion(): void {
    if (!this.online.isOnline()) {
      this.toast.info("You're offline", "This page needs a connection.");
      return;
    }
    if (this.hasNewVersion() || this.probing) {
      // Already surfaced (by the poll or an earlier chunk failure, so the button is lit), or the
      // same failure arriving by its second path while its probe runs: another toast would nag.
      return;
    }
    this.probing = true;
    void this.confirmNewVersion().finally(() => {
      this.probing = false;
    });
  }

  private async confirmNewVersion(): Promise<void> {
    let deployed: boolean;
    try {
      deployed = await this.isNewVersionDeployed(AbortSignal.timeout(PROBE_TIMEOUT_MS));
    } catch {
      // An expected failure, surfaced to the user rather than reported: the server cannot be
      // reached, which is also why the chunk failed.
      this.toast.info("You're offline", "This page needs a connection.");
      return;
    }
    if (!deployed) {
      // The server still runs this build, so the chunk failed for another reason.
      this.toast.info("This page couldn't load", "Check your connection and try again.");
      return;
    }
    if (this.hasNewVersion()) {
      // The poll found the deploy while the probe ran, and the button is already lit.
      return;
    }
    this.hasNewVersion.set(true);
    this.toast.info(
      "Update available",
      "A new version was deployed and part of this page couldn't load. Reload to continue.",
    );
  }
}
