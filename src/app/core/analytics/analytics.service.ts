import { Injectable, afterNextRender, inject } from "@angular/core";
import { ActivatedRouteSnapshot, NavigationEnd, Router } from "@angular/router";
import { filter } from "rxjs";
import { getApps, initializeApp } from "firebase/app";
import {
  Analytics,
  initializeAnalytics,
  isSupported,
  logEvent,
  setAnalyticsCollectionEnabled,
} from "firebase/analytics";
import { injectIsBrowser } from "../composables/is-browser";
import { environment } from "../../../environments/environment";

function firebaseApp() {
  return getApps().length ? getApps()[0] : initializeApp(environment.firebase);
}

/**
 * The route table's pattern for the current page, for `page_path`: `/profile/:id`, not
 * `/profile/<firebase uid>`, and never a query string or fragment. Path routes contribute their
 * configured `path`; the optional-param matcher routes (`/gallery`, `/insiden`, `details`) have no
 * `path`, so their first consumed segment is the literal prefix and any further one is a param.
 */
function routePattern(root: ActivatedRouteSnapshot): string {
  const parts: string[] = [];
  for (let node: ActivatedRouteSnapshot | null = root; node; node = node.firstChild) {
    const { routeConfig: config, url, params } = node;
    if (config?.path) {
      parts.push(config.path);
    } else if (config?.matcher) {
      parts.push(
        ...url.map(({ path }, index) => {
          const name = Object.keys(params).find((key) => params[key] === path);
          return index === 0 || !name ? path : `:${name}`;
        }),
      );
    }
  }
  return `/${parts.join("/")}`;
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
 * events — is done by hand here, and it is the ONLY source of `page_view`: the SDK's own automatic
 * one is switched off (`send_page_view: false`), because it fires on load with the previous
 * document title and the full URL (query string and profile ids included), and a second, manual
 * event for the same landing would count every visit twice.
 *
 * `page_location` is the origin plus that same route pattern, so campaign parameters in the landing
 * URL (`utm_*`, `gclid`) do not reach GA4 and cannot drive attribution. That is deliberate: keeping
 * ids out of reports came first. If campaigns are ever run, pass those parameters on alone.
 *
 * Instantiated once by the root `App` component. Nothing touches the SDK until the first render has
 * finished (`afterNextRender`), so the gtag script does not compete with bootstrap, and only when
 * the browser can run Analytics at all (`isSupported()`: cookies and IndexedDB on).
 */
@Injectable({ providedIn: "root" })
export class AnalyticsService {
  private readonly isBrowser = injectIsBrowser();
  private readonly router = inject(Router);

  constructor() {
    if (this.isBrowser) {
      afterNextRender(() => void this.start());
    }
  }

  private async start(): Promise<void> {
    if (!(await isSupported())) {
      return;
    }
    const analytics = initializeAnalytics(firebaseApp(), { config: { send_page_view: false } });
    // Off in development by default — same reasoning the old app's dev environment applied
    // to Sentry before this session's own change to that: local runs shouldn't inflate real
    // usage numbers. Unlike Sentry's dsn, though, there's no matching "the feature silently
    // stops existing" risk here — logEvent() calls are always safe no-ops either way, so this
    // is the one place in this app where dev genuinely should just stay quiet instead.
    setAnalyticsCollectionEnabled(analytics, environment.production);

    // The first navigation may have ended while the SDK was loading: log the page the rider is on.
    if (this.router.navigated) {
      this.trackPageView(analytics);
    }
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      // The router updates `document.title` right AFTER it emits NavigationEnd, in the same task:
      // one microtask later the title is the new page's.
      .subscribe(() => queueMicrotask(() => this.trackPageView(analytics)));
  }

  private trackPageView(analytics: Analytics): void {
    const path = routePattern(this.router.routerState.snapshot.root);
    logEvent(analytics, "page_view", {
      page_path: path,
      page_location: window.location.origin + path,
      page_title: document.title,
    });
  }
}
