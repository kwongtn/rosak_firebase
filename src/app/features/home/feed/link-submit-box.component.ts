import { Component, inject, output, signal } from "@angular/core";
import { form as createForm, FormField, required, schema, submit } from "@angular/forms/signals";
import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient, GraphQLRequestError } from "../../../core/graphql/graphql-client";
import { HlmButton } from "../../../ui/button/button";
import { HlmInput } from "../../../ui/input/input";
import { ToastService } from "../../../ui/toast/toast.service";
import { LinkSheetService } from "../../insiden/data/link-sheet.service";
import {
  SUBMIT_FEED_LINK_MUTATION,
  SubmitFeedLinkData,
  SubmitFeedLinkVars,
} from "../data/home.queries";
import { HomeStore } from "../data/home.store";
import { normalizeFeedUrl } from "./feed-url.util";

interface LinkSubmitModel {
  url: string;
}

const linkSubmitSchema = schema<LinkSubmitModel>((f) => {
  required(f.url, { message: "Enter a URL" });
});

/**
 * The feed's top-of-feed submit box. Logged out it is a single clickable row that kicks off the
 * Google login flow — deliberately a real `<button>` and not a `disabled` input, because a
 * disabled control swallows the click the login depends on.
 *
 * Logged in it is a two-mode quick submit. The default "Submit Link" button sends just the URL
 * (`{ input: { url } }`) through `submitFeedLink`; the URL field is plain text
 * (`inputmode="url"`) so a schemeless "example.com" is accepted and scheme-qualified by
 * `normalizeFeedUrl` at submit time. A duplicate submission renders an inline "already
 * submitted" note with an anchor to the existing feed row and records the upvote the backend
 * just added, so the feed reflects it immediately. A rejected submission shows an inline error
 * instead of failing silently, and neither a rejection nor a transport failure resets the form
 * or emits.
 *
 * "Advanced Input" opens the shared right-side link sheet (`LinkSheetService` — the same
 * component `/situasi` and `/insiden` host) with whatever URL is already typed passed as a
 * one-shot prefill, so the fuller form (title + asset tags) starts from the quick entry.
 *
 * Validation is submit-gated: the "Enter a URL" note and the input's `aria-invalid` state are
 * driven by the local `submitAttempted` flag, not by `touched()`. The signal-forms `FormField`
 * directive marks a field touched on blur and `submit()` marks it touched too, so `touched()`
 * alone cannot tell "typed here and left" from "actually pressed Submit" — and nagging on blur
 * is exactly what we do not want. Both entry points (the button and Enter) route through
 * `submit()`, so flipping the flag first thing in there covers them both.
 *
 * The form is `novalidate` for the same reason. `FormField` reflects the schema's `required`
 * onto the DOM as a native `required` attribute, and with it present the browser aborts the
 * submission before firing `submit` — the native bubble would show and this component's own
 * inline note would never appear. Turning native validation off leaves one error surface.
 */
@Component({
  selector: "app-link-submit-box",
  imports: [FormField, HlmButton, HlmInput],
  template: `
    @if (!auth.isLoggedIn()) {
      <button
        hlmBtn
        variant="outline"
        type="button"
        data-testid="login-to-submit"
        class="text-muted-foreground h-11 w-full justify-start px-3 text-sm font-normal"
        (click)="auth.login()"
      >
        Log in to submit links
      </button>
    } @else {
      <form
        class="flex flex-col gap-2 sm:flex-row sm:items-start"
        novalidate
        (submit)="$event.preventDefault(); submit()"
      >
        <div class="flex flex-col gap-1 sm:flex-1">
          <input
            hlmInput
            type="text"
            inputmode="url"
            class="h-11"
            placeholder="Paste a link — news, post, thread…"
            aria-label="Link URL"
            [formField]="linkForm.url"
            [errorVisible]="submitAttempted()"
            (keydown.enter)="$event.preventDefault(); submit()"
          />
          @if (linkForm.url().invalid() && submitAttempted()) {
            <p class="text-destructive text-xs">{{ linkForm.url().errors()[0]?.message }}</p>
          }

          @if (submitError(); as message) {
            <p class="text-destructive text-xs" data-testid="feed-submit-error" role="alert">
              {{ message }}
            </p>
          }
        </div>

        <div class="flex gap-2">
          <button
            hlmBtn
            type="submit"
            class="h-11 flex-1 px-4 sm:flex-none"
            [disabled]="isSubmitting()"
          >
            {{ isSubmitting() ? "Submitting…" : "Submit Link" }}
          </button>
          <button
            hlmBtn
            variant="outline"
            type="button"
            class="h-11 flex-1 px-4 sm:flex-none"
            data-testid="advanced-input"
            (click)="openAdvanced()"
          >
            Advanced Input
          </button>
        </div>
      </form>

      @if (duplicateOfId(); as duplicateId) {
        <p
          class="bg-muted mt-2 rounded-lg p-3 text-sm"
          data-testid="duplicate-indicator"
          role="status"
        >
          Already submitted — your upvote was added
          <a class="underline underline-offset-2" [href]="'#feed-link-' + duplicateId"
            >View it in the feed</a
          >
        </p>
      }
    }
  `,
})
export class LinkSubmitBoxComponent {
  protected readonly auth = inject(AuthService);
  private readonly graphql = inject(GraphQLClient);
  private readonly toast = inject(ToastService);
  private readonly store = inject(HomeStore);
  private readonly linkSheet = inject(LinkSheetService);

  protected readonly model = signal<LinkSubmitModel>({ url: "" });
  protected readonly linkForm = createForm(this.model, linkSubmitSchema);

  /** Id (as it appears in the feed row's anchor) of the entry an attempted submit duplicated. */
  protected readonly duplicateOfId = signal<string | null>(null);

  /** Inline failure note for the last submit attempt; cleared on the next attempt and on reset. */
  protected readonly submitError = signal<string | null>(null);

  /** Whether the user has actually pressed Submit (button or Enter). The required-URL error is
   * gated on this rather than on `touched()`, so blurring an empty box stays quiet. */
  protected readonly submitAttempted = signal(false);

  readonly isSubmitting = signal(false);

  /** Emitted after a successful submit (fresh or duplicate) so the host can reload the store. */
  readonly submitted = output<void>();

  /** Opens the shared link sheet in create mode, prefilling it with whatever is already in the
   * quick box (trimmed; empty → blank). The sheet consumes the prefill once. */
  protected openAdvanced(): void {
    this.linkSheet.open(undefined, { url: this.model().url.trim() || undefined });
  }

  async submit(): Promise<void> {
    // Flipped before anything async so an invalid form shows its message on this tick — and so
    // the message is up while `submit()` below decides not to run the mutation at all.
    this.submitAttempted.set(true);
    this.duplicateOfId.set(null);
    this.submitError.set(null);
    this.isSubmitting.set(true);
    try {
      const ok = await submit(this.linkForm, async () => {
        const idToken = await this.auth.idToken();
        const vars: SubmitFeedLinkVars = {
          input: { url: normalizeFeedUrl(this.model().url) },
        };
        const data = await this.graphql.request<SubmitFeedLinkData, SubmitFeedLinkVars>(
          SUBMIT_FEED_LINK_MUTATION,
          vars,
          idToken ? { "firebase-auth-key": idToken } : {},
        );
        this._showSuccess(data.submitFeedLink);
        return [];
      });
      if (ok) {
        this._reset();
        this.submitted.emit();
      }
    } catch (err) {
      // A GraphQL rejection is surfaced verbatim and is already reported to Sentry (and
      // toasted) by GraphQLClient. Anything else — a transport/HTTP failure or a genuinely
      // unexpected error — gets a generic inline retry message and still propagates, so it
      // reaches the Sentry-backed global ErrorHandler instead of being swallowed.
      this.submitError.set(
        err instanceof GraphQLRequestError
          ? err.message
          : "Couldn't submit the link. Please try again.",
      );
      if (!(err instanceof GraphQLRequestError)) {
        throw err;
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private _showSuccess(payload: SubmitFeedLinkData["submitFeedLink"]): void {
    if (payload.isDuplicate) {
      this.duplicateOfId.set(String(payload.duplicateOfId ?? payload.link.id));
      this.store.setUserVote(payload.link.id, payload.userVote);
      return;
    }
    this.toast.success("Link submitted", "It's on the feed now.");
  }

  private _reset(): void {
    this.model.set({ url: "" });
    this.submitError.set(null);
    // A fresh box starts quiet again: the next submit attempt is what should surface errors.
    this.submitAttempted.set(false);
    this.linkForm().reset();
  }
}
