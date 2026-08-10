import { ApplicationConfig, ErrorHandler, provideAppInitializer, provideBrowserGlobalErrorListeners, inject } from "@angular/core";
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from "@angular/router";
import { provideHttpClient } from "@angular/common/http";
import { RECAPTCHA_V3_SITE_KEY, ReCaptchaV3Service, RecaptchaLoaderService } from "ng-recaptcha-2";
import { provideMarkdown } from "ngx-markdown";
import * as Sentry from "@sentry/angular";

import { routes } from "./app.routes";
import { provideClientHydration, withHttpTransferCacheOptions } from "@angular/platform-browser";
import { environment } from "../environments/environment";
import { AnalyticsService } from "./core/analytics/analytics.service";

export const appConfig: ApplicationConfig = {
    providers: [
    // Angular's own bridge from window.onerror/unhandledrejection into ErrorHandler below — kept
    // alongside Sentry's handler (not superseded by it): this covers genuinely global errors
    // that never touch an Angular zone/component at all, while ErrorHandler covers the ones that
    // do (thrown inside a template, a lifecycle hook, an effect). Both routes end up at the same
    // Sentry-backed handler either way.
        provideBrowserGlobalErrorListeners(),
        // Drop-in replacement for Angular's default ErrorHandler that reports to Sentry (see
        // main.ts's Sentry.init) instead of only logging to the console — logErrors:true keeps the
        // console output too, so local debugging doesn't lose anything by having this installed.
        { provide: ErrorHandler, useValue: Sentry.createErrorHandler({ logErrors: true }) },
        // TraceService's constructor is what actually subscribes to Router events and turns them
        // into spans for Sentry.browserTracingIntegration() (see main.ts) to report — it does that
        // work as a side effect of merely being instantiated, so an app initializer that just injects
        // it once at startup is all that's needed to activate it.
        provideAppInitializer(() => {
            inject(Sentry.TraceService);
        }),
        // Same instantiate-once-for-its-side-effects shape as TraceService above — AnalyticsService's
        // constructor is what actually subscribes to Router events and turns them into `page_view`
        // calls (see its own doc comment).
        provideAppInitializer(() => {
            inject(AnalyticsService);
        }),
        // 'enabled' scrolls new navigations to the top (the bug this fixes — e.g. landing mid-page on
        // a vehicle-detail route after scrolling far down a long vehicle list) while still restoring
        // the prior scroll position on real back/forward navigation, which is what people expect.
        // 'enabled' scrolls new navigations to the top (the bug this fixes — e.g. landing mid-page on
        // a vehicle-detail route after scrolling far down a long vehicle list) while still restoring
        // the prior scroll position on real back/forward navigation, which is what people expect.
        provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: "enabled", anchorScrolling: "enabled" })),
        // GraphQL-over-HTTP sends reads as POST too — without includePostRequests, Angular's
        // transfer cache (GET-only by default) would refetch every query again after hydration.
        provideClientHydration(withHttpTransferCacheOptions({ includePostRequests: true })),
        // Angular 22's HttpClient uses the Fetch API by default — no withFetch() needed.
        provideHttpClient(),
        // Only console's markAsRead mutation needs this today — the backend still actively enforces
        // IsRecaptchaChallengePassed there (unlike addEvent, where it's been disabled server-side).
        { provide: RECAPTCHA_V3_SITE_KEY, useValue: environment.captcha.siteKey },
        // ng-recaptcha-2's own services are plain `@Injectable()` with no `providedIn` — unlike most
        // Angular libraries, importing the class isn't enough; they need explicit registration here,
        // or `inject(ReCaptchaV3Service)` in ConsolePage throws NG0201 (confirmed: this crashed SSR
        // rendering entirely for /console, surfacing as a plain Express 404 rather than any visible
        // Angular error).
        ReCaptchaV3Service,
        RecaptchaLoaderService,
        // Renders CalendarIncident.details on /insiden. Mermaid/KaTeX/Prism/emoji extensions
        // deliberately left off — no incident content uses them today, and each pulls in a sizeable
        // extra dependency; trivial to add later if a real incident writeup needs one.
        provideMarkdown(),
    ]
};
