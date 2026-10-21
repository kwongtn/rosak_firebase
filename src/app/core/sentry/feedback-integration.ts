// FeedbackService loads this file with a dynamic import() the first time someone opens "Report a
// bug". It rebuilds @sentry/browser's own feedbackIntegration from the same parts (that package's
// feedbackSync.js) on a "?lazy" private copy of @sentry/feedback, because importing the browser
// package's version would link the real @sentry/feedback back into the first-load bundle — see
// replay-integration.ts for why the copy is needed.
import {
  buildFeedbackIntegration,
  feedbackModalIntegration,
  feedbackScreenshotIntegration,
} from "@sentry/feedback?lazy";

const feedbackIntegration = buildFeedbackIntegration({
  getModalIntegration: () => feedbackModalIntegration,
  getScreenshotIntegration: () => feedbackScreenshotIntegration,
});

/** The widget with the options Sentry.init() used to give it. autoInject:false — the app's own
 * "Report a bug" buttons are the only trigger, instead of Sentry's floating default one, so the app
 * controls where and how it is surfaced. */
export function createFeedback() {
  return feedbackIntegration({ autoInject: false, colorScheme: "system" });
}
