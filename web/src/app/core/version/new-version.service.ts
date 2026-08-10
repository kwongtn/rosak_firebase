import { Injectable, PLATFORM_ID, inject, signal } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { buildInfo } from "../../../build-info";

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

    readonly hasNewVersion = signal(false);

    constructor() {
        if (!this.isBrowser) {
            return;
        }
        this.checkOnce();
        setInterval(() => this.checkOnce(), CHECK_INTERVAL_MS);
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
        } catch {
            // Offline, or the request otherwise failed — indistinguishable from "no new version"
            // from here, and worth simply trying again at the next interval rather than surfacing
            // a transient network hiccup as anything the user needs to act on.
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
}
