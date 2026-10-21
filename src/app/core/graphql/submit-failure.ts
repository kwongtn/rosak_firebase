import { ToastService } from "../../ui/toast/toast.service";

/**
 * Tells the rider a submit failed for a reason `GraphQLClient` does not toast: a dropped
 * connection, a 429, a 5xx, a rejected ID token — anything that is not a `GraphQLRequestError`
 * (the client already toasts those). Without it the Submit button just re-enables and nothing says
 * what happened.
 *
 * Call it from a form's submit `catch`, then rethrow so Sentry still receives the error. The draft
 * is untouched at that point, so the copy only has to say "try again".
 */
export function toastSubmitFailure(toast: ToastService): void {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  toast.error(
    "Couldn't submit",
    offline
      ? "You're offline. Your draft is kept; try again when you're back online."
      : "Check your connection and try again.",
  );
}
