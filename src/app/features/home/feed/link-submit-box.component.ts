import { Component, computed, inject, output, signal } from "@angular/core";
import { form as createForm, FormField, required, schema, submit } from "@angular/forms/signals";
import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient, GraphQLRequestError } from "../../../core/graphql/graphql-client";
import { HlmButton } from "../../../ui/button/button";
import { HlmInput } from "../../../ui/input/input";
import { HlmNativeSelect } from "../../../ui/select/native-select";
import { ToastService } from "../../../ui/toast/toast.service";
import {
  AssetMultiSelectComponent,
  AssetMultiSelectOption,
} from "../../insiden/asset-multi-select/asset-multi-select.component";
import {
  SUBMIT_FEED_LINK_MUTATION,
  SubmitFeedLinkData,
  SubmitFeedLinkVars,
  type PassengerStatus,
} from "../data/home.queries";
import { HomeStore } from "../data/home.store";
import { PASSENGER_LABEL } from "../data/passenger-status.util";

interface LinkSubmitModel {
  url: string;
}

/** All seven passenger statuses in schema order (`Object.keys` preserves the literal's order). */
const STATUS_OPTIONS = Object.keys(PASSENGER_LABEL) as PassengerStatus[];

const linkSubmitSchema = schema<LinkSubmitModel>((f) => {
  required(f.url, { message: "Enter a URL" });
});

/**
 * The feed's top-of-feed submit box. Logged out it is a single clickable row that kicks off the
 * Google login flow — deliberately a real `<button>` and not a `disabled` input, because a
 * disabled control swallows the click the login depends on. Logged in it submits a URL, an
 * optional line status and the affected lines through `submitFeedLink`; a status without a line
 * is blocked locally (the backend rejects that combination). A duplicate submission renders an
 * inline "already submitted" note with an anchor to the existing feed row and records the
 * upvote the backend just added, so the feed reflects it immediately.
 */
@Component({
  selector: "app-link-submit-box",
  imports: [FormField, HlmButton, HlmInput, HlmNativeSelect, AssetMultiSelectComponent],
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
      <form class="flex flex-col gap-2" (submit)="$event.preventDefault(); submit()">
        <input
          hlmInput
          type="url"
          class="h-11"
          placeholder="Paste a link — news, post, thread…"
          aria-label="Link URL"
          [formField]="linkForm.url"
          (keydown.enter)="$event.preventDefault(); submit()"
        />
        @if (linkForm.url().invalid() && linkForm.url().touched()) {
          <p class="text-destructive text-xs">{{ linkForm.url().errors()[0]?.message }}</p>
        }

        <select
          hlmSelect
          class="h-11"
          aria-label="Line status"
          [value]="selectedStatus() ?? ''"
          (change)="_onStatusChange($event)"
        >
          <option value="">Line status (optional)</option>
          @for (status of statusOptions; track status) {
            <option [value]="status">{{ passengerLabel[status] }}</option>
          }
        </select>

        <app-asset-multi-select
          heading="Lines"
          [optional]="true"
          [options]="lineOptions()"
          [(selectedIds)]="selectedLineIds"
          emptyMessage="No lines available."
          searchPlaceholder="Search lines"
        />

        @if (statusLineError()) {
          <p class="text-destructive text-xs" data-testid="status-line-error" role="alert">
            Pick at least one line to report a line status.
          </p>
        }

        <button hlmBtn type="submit" class="h-11 w-full px-4 sm:w-auto" [disabled]="isSubmitting()">
          {{ isSubmitting() ? "Submitting…" : "Submit link" }}
        </button>
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

  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly passengerLabel = PASSENGER_LABEL;

  protected readonly model = signal<LinkSubmitModel>({ url: "" });
  protected readonly linkForm = createForm(this.model, linkSubmitSchema);

  protected readonly selectedLineIds = signal<string[]>([]);
  protected readonly selectedStatus = signal<PassengerStatus | null>(null);
  protected readonly statusLineError = signal(false);

  /** Id (as it appears in the feed row's anchor) of the entry an attempted submit duplicated. */
  protected readonly duplicateOfId = signal<string | null>(null);

  readonly isSubmitting = signal(false);

  /** Emitted after a successful submit (fresh or duplicate) so the host can reload the store. */
  readonly submitted = output<void>();

  /** Lines the submitter can tag, from the page's store (fetched once by the route-scoped store). */
  protected readonly lineOptions = computed<AssetMultiSelectOption[]>(() =>
    this.store.lines().map((line) => ({
      id: line.id,
      label: `${line.code} — ${line.displayName}`,
    })),
  );

  protected _onStatusChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedStatus.set((value || null) as PassengerStatus | null);
  }

  async submit(): Promise<void> {
    this.duplicateOfId.set(null);
    const status = this.selectedStatus();
    if (status !== null && this.selectedLineIds().length === 0) {
      this.statusLineError.set(true);
      return;
    }
    this.statusLineError.set(false);
    this.isSubmitting.set(true);
    try {
      const ok = await submit(this.linkForm, async () => {
        const idToken = await this.auth.idToken();
        const vars: SubmitFeedLinkVars = {
          input: {
            url: this.model().url,
            lineIds: this.selectedLineIds(),
            // Only sent when chosen — `status: null` on the backend means "no report".
            ...(status ? { status } : {}),
          },
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
      if (err instanceof GraphQLRequestError) {
        return;
      }
      throw err;
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
    this.selectedLineIds.set([]);
    this.selectedStatus.set(null);
    this.statusLineError.set(false);
    this.linkForm().reset();
  }
}
