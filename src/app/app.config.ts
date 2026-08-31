import {
  ApplicationConfig,
  ErrorHandler,
  Injectable,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  inject,
} from "@angular/core";
import {
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
  withPreloading,
} from "@angular/router";
import { HttpErrorResponse, provideHttpClient } from "@angular/common/http";
import * as Sentry from "@sentry/angular";

import { routes } from "./app.routes";
import {
  provideClientHydration,
  withEventReplay,
  withHttpTransferCacheOptions,
} from "@angular/platform-browser";
import { AnalyticsService } from "./core/analytics/analytics.service";
import { NewVersionService } from "./core/version/new-version.service";
import { HoverPreloadStrategy } from "./core/routing/hover-preload.strategy";

/**
 * Checks if an error represents an HTTP 404 / Not Found error that should be ignored
 * from server and client error logging (e.g. in Firebase App Hosting error logs and Sentry).
 */
export function is404Error(error: unknown): boolean {
  if (!error) {
    return false;
  }
  if (error instanceof HttpErrorResponse && error.status === 404) {
    return true;
  }
  const original = (error as { ngOriginalError?: unknown })?.ngOriginalError;
  if (original && is404Error(original)) {
    return true;
  }
  if (typeof error === "object" && error !== null) {
    const candidate = error as { status?: unknown; statusCode?: unknown; message?: unknown };
    if (candidate.status === 404 || candidate.statusCode === 404) {
      return true;
    }
    if (typeof candidate.message === "string" && /\b404\b/i.test(candidate.message)) {
      return true;
    }
  }
  if (typeof error === "string" && /\b404\b/i.test(error)) {
    return true;
  }
  return false;
}

/**
 * Custom ErrorHandler that wraps Sentry's error handler while automatically ignoring
 * 404 (Not Found) errors so they are not captured in Firebase App Hosting error logs or Sentry.
 */
@Injectable()
export class AppErrorHandler implements ErrorHandler {
  private readonly sentryHandler = Sentry.createErrorHandler({ logErrors: true });

  handleError(error: unknown): void {
    if (is404Error(error)) {
      return;
    }
    this.sentryHandler.handleError(error);
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    // Angular's own bridge from window.onerror/unhandledrejection into ErrorHandler below — kept
    // alongside Sentry's handler (not superseded by it): this covers genuinely global errors
    // that never touch an Angular zone/component at all, while ErrorHandler covers the ones that
    // do (thrown inside a template, a lifecycle hook, an effect). Both routes end up at the same
    // Sentry-backed handler either way.
    provideBrowserGlobalErrorListeners(),
    // Drop-in replacement for Angular's default ErrorHandler that reports to Sentry (see
    // main.ts's Sentry.init) while automatically filtering out 404 errors from App Hosting logs.
    { provide: ErrorHandler, useClass: AppErrorHandler },
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
    // Same shape again for NewVersionService: its constructor starts the /version.json poll AND
    // registers the stale-chunk failure listeners, and anchoring it here (not relying on the nav
    // component's injection) means both run for the app's whole lifetime regardless of which
    // chrome happens to render. SSR-safe — everything browser-only is guarded inside.
    provideAppInitializer(() => {
      inject(NewVersionService);
    }),
    // 'enabled' scrolls new navigations to the top (the bug this fixes — e.g. landing mid-page on
    // a vehicle-detail route after scrolling far down a long vehicle list) while still restoring
    // the prior scroll position on real back/forward navigation, which is what people expect.
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: "enabled", anchorScrolling: "enabled" }),
      withPreloading(HoverPreloadStrategy),
    ),
    // GraphQL-over-HTTP sends reads as POST too — without includePostRequests, Angular's
    // transfer cache (GET-only by default) would refetch every query again after hydration.
    provideClientHydration(
      withEventReplay(),
      withHttpTransferCacheOptions({ includePostRequests: true }),
    ),
    // Angular 22's HttpClient uses the Fetch API by default — no withFetch() needed.
    provideHttpClient(),
  ],
};
