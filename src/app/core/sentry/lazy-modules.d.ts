// Types for the "?lazy" private-copy imports (why they exist: replay-integration.ts). Each module
// has exactly the exports of the plain package it copies.
declare module "@sentry/replay?lazy" {
  export { replayIntegration } from "@sentry/replay";
}

declare module "@sentry/feedback?lazy" {
  export {
    buildFeedbackIntegration,
    feedbackModalIntegration,
    feedbackScreenshotIntegration,
  } from "@sentry/feedback";
}
