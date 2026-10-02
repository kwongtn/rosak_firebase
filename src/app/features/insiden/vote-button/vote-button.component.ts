import { Component, computed, inject, input, output, signal } from "@angular/core";
import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient } from "../../../core/graphql/graphql-client";
import { ToastService } from "../../../ui/toast/toast.service";
import {
  DOWNVOTE_SOCIAL_MEDIA_LINK_MUTATION,
  REMOVE_SOCIAL_MEDIA_LINK_VOTE_MUTATION,
  SocialMediaLinkVoteData,
  SocialMediaLinkVoteVars,
  UPVOTE_SOCIAL_MEDIA_LINK_MUTATION,
} from "../../home/data/home.queries";
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
  type VoteAcknowledgement,
  type VoteState,
  type VoteValue,
  voteStateFromAcknowledgement,
  voteStatsKey,
} from "./vote-state.util";

/**
 * Upvote/downvote control showing the net score with a hover breakdown tooltip.
 * Clicks apply an optimistic projection (vote-state.util.ts) immediately and fire
 * the matching mutation; a failed request rolls the display back to the previous
 * state and surfaces a toast. Switching votes sends the new-direction mutation —
 * the backend's update_or_create makes that idempotent.
 *
 * 🔴 WHY THIS IS NOT A `linkedSignal` (the bug this replaced)
 * -------------------------------------------------------
 * The display used to be a `linkedSignal` seeded from the inputs, so ANY input
 * change reset it from scratch. The host writes the vote it just received back
 * down as its `userVote` overlay, which reset the control from inputs that still
 * carried the PRE-CLICK `netScore` — so the arrow stayed lit while the score and
 * the breakdown snapped back, and any refetch mid-flight clobbered it again. The
 * race was between the acknowledgement and the control's own re-seed.
 *
 * Three layers fix it, in priority order:
 * 1. `optimistic` — the in-flight projection, cleared the moment the request settles.
 * 2. `confirmed` — the snapshot the SERVER acknowledged, honoured only while the
 *    host's counters still match the ones it was computed against. `voteStatsKey`
 *    deliberately excludes `userVote`, so the host echoing our own value back does
 *    NOT count as new data; only a real refetch (the home feed polls) does, and then
 *    the host's numbers are newer than ours and correctly win.
 * 3. `hostState` — the inputs themselves, i.e. a plain server render.
 *
 * Three callable targets: the default "incident" votes the calendar incident,
 * "chronology" votes a single chronology row through the Task 8 mutations, and
 * "link" votes a feed/insiden social-media link through the front-page feed's
 * upvoteSocialMediaLink/downvoteSocialMediaLink/removeSocialMediaLinkVote mutations.
 * All six mutations acknowledge with the SAME `VoteMutationPayload` shape, so the
 * optimistic state, the server repaint, disabled-while-voting, and auth gating
 * (logged-out users see the buttons disabled) behave identically for all three.
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
   * Task 8 upvoteChronology/downvoteChronology/removeChronologyVote mutations; "link" targets a
   * social-media link via the front page's upvoteSocialMediaLink/downvoteSocialMediaLink/
   * removeSocialMediaLinkVote mutations. */
  readonly targetType = input<"incident" | "chronology" | "link">("incident");

  /** Backend object id this button votes on — the incident id for targetType "incident", the
   * chronology row id (chronologies { id }) for targetType "chronology", and the
   * social-media link id for targetType "link" (the argument is named `socialMediaLinkId`
   * there, but carrying it on this same input keeps every existing call site untouched). */
  readonly incidentId = input.required<string>();
  readonly netScore = input(0);
  readonly upvotes = input(0);
  readonly downvotes = input(0);
  /** 1 upvoted, -1 downvoted, 0 no vote. */
  readonly userVote = input<VoteValue>(0);

  /** Emitted with the caller's new vote value after a successful mutation, so the host can
   * mirror it into its own store (e.g. HomeStore.setUserVote). The value is the SERVER's,
   * not the requested one, so a host that re-feeds it lands on the number already displayed.
   * Not emitted on failure — the display has already rolled back. */
  readonly voteChanged = output<{ value: number }>();

  /** What the host last handed us: the server's truth on first render, and a refetch
   * of it later. Plain `computed`, not a `linkedSignal` — see the header for why a
   * signal seeded from the inputs cannot be the display. */
  private readonly hostState = computed<VoteState>(() => ({
    netScore: this.netScore(),
    upvotes: this.upvotes(),
    downvotes: this.downvotes(),
    userVote: this.userVote(),
  }));

  /** The in-flight optimistic projection. `null` whenever nothing is in flight. */
  private readonly optimistic = signal<VoteState | null>(null);

  /**
   * The snapshot the server acknowledged, kept together with the counter triple it was
   * computed against. That key is what stops the host's echo of our own `userVote`
   * from re-seeding the display with pre-click numbers — see `voteStatsKey`.
   */
  private readonly confirmed = signal<{ key: string; state: VoteState } | null>(null);

  /** The displayed state: in-flight projection → acknowledged snapshot → host inputs. */
  protected readonly state = computed<VoteState>(() => {
    const optimistic = this.optimistic();
    if (optimistic) {
      return optimistic;
    }
    const confirmed = this.confirmed();
    if (confirmed && confirmed.key === voteStatsKey(this.hostState())) {
      return confirmed.state;
    }
    return this.hostState();
  });

  protected readonly isVoting = signal(false);

  protected readonly formatNetScore = formatNetScore;
  protected readonly breakdown = computed(() =>
    formatBreakdown(this.state().upvotes, this.state().downvotes),
  );

  protected readonly ariaLabel = computed(() => {
    if (this.targetType() === "chronology") {
      return "Vote on this chronology";
    }
    if (this.targetType() === "link") {
      return "Vote on this link";
    }
    return "Vote on this incident";
  });

  protected async onVoteClick(target: Exclude<VoteValue, 0>): Promise<void> {
    const previous = this.state();
    const nextTarget: VoteValue = previous.userVote === target ? 0 : target;

    // Optimistic: show the projected numbers before the server confirms.
    this.optimistic.set(nextVoteState(previous, nextTarget));
    this.isVoting.set(true);
    try {
      const ack = await this.requestVote(nextTarget);
      // 🔴 THE SERVER WINS. Repaint from what the write produced, not from the
      // projection — and record the value the host must mirror, which is the
      // server's, so the echo lands on the same number that is already displayed.
      const acknowledged = voteStateFromAcknowledgement(ack, this.optimistic() ?? previous);
      this.confirmed.set({ key: voteStatsKey(this.hostState()), state: acknowledged });
      this.optimistic.set(null);
      this.voteChanged.emit({ value: acknowledged.userVote });
    } catch {
      // Drop the projection: `state` falls back to the last acknowledged snapshot
      // (or the host's numbers), which is the newest thing we know to be true.
      this.optimistic.set(null);
      this.toast.error("Vote not recorded", "Please try again in a moment.");
    } finally {
      this.isVoting.set(false);
    }
  }

  /** Sends the mutation for `target` and returns the vote state it acknowledged with.
   * Resolving to `null`/a partial payload is not a failure — the control simply keeps
   * the projection it already showed (see `voteStateFromAcknowledgement`).
   *
   * Each branch pairs a document with the ROOT FIELD its payload lives under, so the
   * response is read in one place instead of three near-identical `await`s. `as const` is
   * what keeps `field` a literal union instead of widening to `string`. */
  private async requestVote(target: VoteValue): Promise<VoteAcknowledgement | null> {
    const idToken = await this.auth.idToken();
    const headers: Record<string, string> = idToken ? { "firebase-auth-key": idToken } : {};
    if (this.targetType() === "chronology") {
      const [mutation, field] =
        target === 1
          ? ([UPVOTE_CHRONOLOGY_MUTATION, "upvoteChronology"] as const)
          : target === -1
            ? ([DOWNVOTE_CHRONOLOGY_MUTATION, "downvoteChronology"] as const)
            : ([REMOVE_CHRONOLOGY_VOTE_MUTATION, "removeChronologyVote"] as const);
      const data = await this.graphql.request<
        ChronologyVoteMutationData,
        ChronologyVoteMutationVars
      >(mutation, { chronologyId: this.incidentId() }, headers);
      return data[field] ?? null;
    }
    if (this.targetType() === "link") {
      const [mutation, field] =
        target === 1
          ? ([UPVOTE_SOCIAL_MEDIA_LINK_MUTATION, "upvoteSocialMediaLink"] as const)
          : target === -1
            ? ([DOWNVOTE_SOCIAL_MEDIA_LINK_MUTATION, "downvoteSocialMediaLink"] as const)
            : ([REMOVE_SOCIAL_MEDIA_LINK_VOTE_MUTATION, "removeSocialMediaLinkVote"] as const);
      const data = await this.graphql.request<SocialMediaLinkVoteData, SocialMediaLinkVoteVars>(
        mutation,
        { id: this.incidentId() },
        headers,
      );
      return data[field] ?? null;
    }
    const [mutation, field] =
      target === 1
        ? ([UPVOTE_MUTATION, "upvote"] as const)
        : target === -1
          ? ([DOWNVOTE_MUTATION, "downvote"] as const)
          : ([REMOVE_VOTE_MUTATION, "removeVote"] as const);
    const data = await this.graphql.request<VoteMutationData, VoteMutationVars>(
      mutation,
      { incidentId: this.incidentId() },
      headers,
    );
    return data[field] ?? null;
  }
}
