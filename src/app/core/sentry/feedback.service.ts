import { Injectable, InjectionToken, inject } from "@angular/core";
import * as Sentry from "@sentry/angular";

import { injectIsBrowser } from "../composables/is-browser";
import { ThemeService } from "../theme/theme.service";
// Type-only (erased at compile time): a value import would drag the widget into the first load.
import type { createFeedback } from "./feedback-integration";

type Feedback = ReturnType<typeof createFeedback>;
type FeedbackForm = Awaited<ReturnType<Feedback["createForm"]>>;

/** Fetches the widget's chunk, creates the widget and registers it with the Sentry client. Injected
 * (not imported) so specs stay hermetic even though the unit-test builder shares one module
 * registry across all spec files. */
export const LOAD_FEEDBACK = new InjectionToken<() => Promise<Feedback>>("LoadFeedback", {
  providedIn: "root",
  factory: () => async () => {
    const feedback = (await import("./feedback-integration")).createFeedback();
    Sentry.addIntegration(feedback);
    return feedback;
  },
});

/**
 * Sentry's User Feedback widget behind a lazy load. Its code (~60 KB) is its own chunk, fetched the
 * first time someone opens "Report a bug" instead of on every page load — which is why nothing in
 * the first-load graph may reference `Sentry.feedbackIntegration` or `Sentry.getFeedback()`
 * statically (main.ts doesn't register it either). The app's own "Report a bug" buttons (app-nav
 * icon tray, compact nav) are its only trigger, each calling `openForm()` from a plain (click)
 * binding. Browser-only: on the server it loads nothing.
 */
@Injectable({ providedIn: "root" })
export class FeedbackService {
  private readonly isBrowser = injectIsBrowser();
  private readonly theme = inject(ThemeService);
  private readonly loadFeedback = inject(LOAD_FEEDBACK);

  /** Cached so concurrent and later opens share one load. */
  private feedback: Promise<Feedback | undefined> | undefined;
  /** Created once, then reused on every later open (createForm(), not attachTo() — see the nav
   * icon tray's template comment for why). */
  private form: Promise<FeedbackForm | undefined> | undefined;

  /** Loads the widget on first use, then shows its form. */
  async openForm(): Promise<void> {
    const feedback = await this.load();
    // Re-applied on every open (which also covers the first one, right after the lazy load).
    // `resolvedTheme`, not the raw "system" mode: it is already the concrete light/dark this app is
    // painting, tracking the OS preference live, so the widget needn't re-derive that itself.
    feedback?.setTheme(this.theme.resolvedTheme());
    this.form ??= feedback?.createForm();
    const form = await this.form;
    form?.appendToDom();
    form?.open();
  }

  private load(): Promise<Feedback | undefined> {
    if (!this.isBrowser) {
      return Promise.resolve(undefined);
    }
    this.feedback ??= this.loadFeedback().catch((err: unknown) => {
      // Forget the failed attempt so the next click retries instead of replaying this rejection.
      this.feedback = undefined;
      throw err;
    });
    return this.feedback;
  }
}
