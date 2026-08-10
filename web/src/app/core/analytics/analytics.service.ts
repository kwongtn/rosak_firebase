import { isPlatformBrowser } from "@angular/common";
import { Injectable, PLATFORM_ID, inject } from "@angular/core";
import { NavigationEnd, Router } from "@angular/router";
import { filter } from "rxjs";
import { getApps, initializeApp } from "firebase/app";
import { Analytics, getAnalytics, logEvent, setAnalyticsCollectionEnabled } from "firebase/analytics";
import { environment } from "../../../environments/environment";

function firebaseApp() {
    return getApps().length ? getApps()[0] : initializeApp(environment.firebase);
}

/**
 * Firebase Analytics (GA4 under the hood — `environment.firebase.measurementId` was already
 * provisioned, just never wired up anywhere in this rewrite). Ported from the old app's
 * `@angular/fire/analytics` setup (`provideAnalytics` + `ScreenTrackingService`/
 * `UserTrackingService`), but on the same direct-SDK pattern this app already uses for Firestore
 * (see about.page.ts's own `firebaseApp()`) rather than pulling in `@angular/fire` as a whole
 * second Firebase integration surface just for this.
 *
 * `ScreenTrackingService`'s actual job — turning Angular Router navigations into `page_view`
 * events — is the one part that has to be done by hand here: the Firebase JS SDK's own
 * automatically-collected `page_view` only fires once, on the initial real page load, and has no
 * way to know a zoneless SPA's route changed under it without a real browser navigation.
 *
 * Instantiated once via an app initializer (see app.config.ts) — everything after that is a side
 * effect of the constructor's Router subscription, same shape as Sentry.TraceService right above
 * it in that same providers list.
 */
@Injectable({ providedIn: "root" })
export class AnalyticsService {
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
    private analytics: Analytics | null = null;

    constructor() {
        if (!this.isBrowser) {
            return;
        }
        this.analytics = getAnalytics(firebaseApp());
        // Off in development by default — same reasoning the old app's dev environment applied
        // to Sentry before this session's own change to that: local runs shouldn't inflate real
        // usage numbers. Unlike Sentry's dsn, though, there's no matching "the feature silently
        // stops existing" risk here — logEvent() calls are always safe no-ops either way, so this
        // is the one place in this app where dev genuinely should just stay quiet instead.
        setAnalyticsCollectionEnabled(this.analytics, environment.production);

        const router = inject(Router);
        router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd)).subscribe((event) => {
            this.trackPageView(event.urlAfterRedirects);
        });
    }

    private trackPageView(path: string): void {
        if (!this.analytics) {
            return;
        }
        logEvent(this.analytics, "page_view", {
            page_path: path,
            page_location: window.location.origin + path,
            page_title: document.title,
        });
    }
}
