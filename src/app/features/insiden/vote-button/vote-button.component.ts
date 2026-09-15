import { Component, computed, inject, input, linkedSignal, signal } from "@angular/core";
import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient } from "../../../core/graphql/graphql-client";
import { ToastService } from "../../../ui/toast/toast.service";
import {
  ChronologyVoteMutationData,
  ChronologyVoteMutationVars,
  DOWNVOTE_CHRONOLOGY_MUTATION,
  DOWNVOTE_MUTATION,
  REMOVE_CHRONOLOGY_VOTE_MUTATION,
  REMOVE_VOTE_MUTATION,
  UPVOTE_CHRONOLOGY_MUTATION,
  UPVOTE_MUTATION,
  VoteMutationData,
  VoteMutationVars,
} from "../data/insiden.queries";
import {
  formatBreakdown,
  formatNetScore,
  nextVoteState,
  type VoteState,
  type VoteValue,
} from "./vote-state.util";

/**
 * Upvote/downvote control showing the net score with a hover breakdown tooltip.
 * Clicks apply an optimistic projection (vote-state.util.ts) immediately and fire
 * the matching mutation; a failed request rolls the display back to the previous
 * state and surfaces a toast. Switching votes sends the new-direction mutation —
 * the backend's update_or_create makes that idempotent.
 *
 * Two callable targets (Task 13): the default "incident" votes the calendar incident,
 * "chronology" votes a single chronology row through the Task 8 mutations. The
 * optimistic state, disabled-while-voting, and auth gating (logged-out users see
 * the buttons disabled) behave identically for both.
 */
@Component({
  selector: "app-vote-button",
  imports: [],
  template: `
    <div class="group/vote flex items-center gap-0.5" [attr.aria-label]="ariaLabel()">
      <button
        hlmBtn
        variant="ghost"
        size="sm"
        type="button"
        aria-label="Upvote"
        [attr.aria-pressed]="state().userVote === 1"
        [class.text-green-600]="state().userVote === 1"
        [disabled]="!auth.isLoggedIn() || isVoting()"
        (click)="onVoteClick(1)"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="size-4"
          aria-hidden="true"
        >
          <path d="m18 15-6-6-6 6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>

      <span class="relative min-w-8 text-center text-sm font-semibold tabular-nums">
        {{ formatNetScore(state().netScore) }}
        <span
          role="tooltip"
          class="bg-popover text-popover-foreground pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 rounded-md border px-2 py-1 text-xs font-normal whitespace-nowrap opacity-0 shadow-md transition-opacity group-hover/vote:opacity-100"
        >
          {{ breakdown() }}
        </span>
      </span>

      <button
        hlmBtn
        variant="ghost"
        size="sm"
        type="button"
        aria-label="Downvote"
        [attr.aria-pressed]="state().userVote === -1"
        [class.text-red-600]="state().userVote === -1"
        [disabled]="!auth.isLoggedIn() || isVoting()"
        (click)="onVoteClick(-1)"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="size-4"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </div>
  `,
})
export class VoteButtonComponent {
  readonly auth = inject(AuthService);
  private readonly graphql = inject(GraphQLClient);
  private readonly toast = inject(ToastService);

  /** What this button votes on: "incident" (default) targets the calendar incident via the
   * upvote/downvote/removeVote mutations; "chronology" targets a single chronology row via the
   * Task 8 upvoteChronology/downvoteChronology/removeChronologyVote mutations. */
  readonly targetType = input<"incident" | "chronology">("incident");

  /** Backend object id this button votes on — the incident id for targetType "incident",
   * the chronology row id (chronologies { id }) for targetType "chronology". */
  readonly incidentId = input.required<string>();
  readonly netScore = input(0);
  readonly upvotes = input(0);
  readonly downvotes = input(0);
  /** 1 upvoted, -1 downvoted, 0 no vote. */
  readonly userVote = input<VoteValue>(0);

  /** linkedSignal, not a plain signal seeded in a field initializer: input
   * signals only carry their bound values after construction, so a plain seed
   * would lock the display at 0 until the first click. linkedSignal tracks the
   * inputs (server truth on refetch) while .set() applies optimistic updates. */
  protected readonly state = linkedSignal<VoteState>(() => ({
    netScore: this.netScore(),
    upvotes: this.upvotes(),
    downvotes: this.downvotes(),
    userVote: this.userVote(),
  }));

  protected readonly isVoting = signal(false);

  protected readonly formatNetScore = formatNetScore;
  protected readonly breakdown = computed(() =>
    formatBreakdown(this.state().upvotes, this.state().downvotes),
  );

  protected readonly ariaLabel = computed(() =>
    this.targetType() === "chronology" ? "Vote on this chronology" : "Vote on this incident",
  );

  protected async onVoteClick(target: Exclude<VoteValue, 0>): Promise<void> {
    const previous = this.state();
    const nextTarget: VoteValue = previous.userVote === target ? 0 : target;

    // Optimistic: show the projected numbers before the server confirms.
    this.state.set(nextVoteState(previous, nextTarget));
    this.isVoting.set(true);
    try {
      await this.requestVote(nextTarget);
    } catch {
      this.state.set(previous);
      this.toast.error("Vote not recorded", "Please try again in a moment.");
    } finally {
      this.isVoting.set(false);
    }
  }

  private async requestVote(target: VoteValue): Promise<void> {
    const idToken = await this.auth.idToken();
    const headers: Record<string, string> = idToken ? { "firebase-auth-key": idToken } : {};
    if (this.targetType() === "chronology") {
      const mutation =
        target === 1
          ? UPVOTE_CHRONOLOGY_MUTATION
          : target === -1
            ? DOWNVOTE_CHRONOLOGY_MUTATION
            : REMOVE_CHRONOLOGY_VOTE_MUTATION;
      await this.graphql.request<ChronologyVoteMutationData, ChronologyVoteMutationVars>(
        mutation,
        { chronologyId: this.incidentId() },
        headers,
      );
      return;
    }
    const mutation =
      target === 1 ? UPVOTE_MUTATION : target === -1 ? DOWNVOTE_MUTATION : REMOVE_VOTE_MUTATION;
    await this.graphql.request<VoteMutationData, VoteMutationVars>(
      mutation,
      {
        incidentId: this.incidentId(),
      },
      headers,
    );
  }
}
