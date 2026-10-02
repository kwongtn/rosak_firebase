/**
 * Pure vote-state math behind the vote button: optimistic projections (including
 * switch deltas), the normaliser for the snapshot a vote mutation acknowledges
 * with, and display formatting. Free of Angular so the exact numbers users see
 * before/after a click are unit-testable in isolation.
 */

export type VoteValue = -1 | 0 | 1;

export interface VoteState {
  readonly netScore: number;
  readonly upvotes: number;
  readonly downvotes: number;
  /** The current user's own vote: 1 up, -1 down, 0 none. */
  readonly userVote: VoteValue;
}

/**
 * The vote state a vote mutation acknowledges with — `VoteMutationPayload` on the
 * wire (`userVote` / `voteScore` / `upvotes` / `downvotes`). The payload's `ok` is
 * deliberately NOT part of it: the control treats a rejected request as the failure
 * signal and never reads `ok`, so an acknowledgement is only ever the numbers.
 */
export interface VoteAcknowledgement {
  readonly userVote: number;
  readonly voteScore: number;
  readonly upvotes: number;
  readonly downvotes: number;
}

/** Clamps an arbitrary number onto {-1, 0, 1}. Anything else (0, 2, NaN) is "no vote". */
export function toVoteValue(value: number): VoteValue {
  return value === 1 ? 1 : value === -1 ? -1 : 0;
}

/**
 * Identity of the COUNTERS alone, deliberately excluding `userVote`.
 *
 * This is the staleness test for an acknowledged snapshot: the host re-renders this
 * control whenever its own vote overlay changes, and that must NOT be read as "new
 * server data" — the host is echoing the value we just told it. Only a change in the
 * counters means the host genuinely refetched (the home feed polls), which is the one
 * thing allowed to supersede what the server last told us.
 */
export function voteStatsKey(state: VoteState): string {
  return `${state.netScore}/${state.upvotes}/${state.downvotes}`;
}

/**
 * 🔴 The server's snapshot, not the client's arithmetic.
 *
 * A `{ ok }`-only acknowledgement leaves the client to work out the new score itself,
 * and that projection then races its OWN echo (the host writes the value back down as
 * `userVote`, which resets the control) and every other voter — so the indicator
 * visibly snaps back to a number that was true before the click. Repainting from this
 * snapshot makes the mutation response the single source of truth.
 *
 * Every field degrades to `fallback` when it is not a finite number, so a
 * partially-shaped or cached payload paints the pre-click state instead of `undefined`.
 * Note that `userVote` degrades too, rather than to "no vote": a value we cannot read is a
 * value we must not change, and 0 would actively un-light an arrow the server may well
 * still consider cast. A value that IS there is still clamped, so an out-of-range one
 * cannot reach the `aria-pressed` comparisons.
 */
export function voteStateFromAcknowledgement(
  ack: VoteAcknowledgement | null | undefined,
  fallback: VoteState,
): VoteState {
  if (!ack) {
    return fallback;
  }
  const finite = (value: number, otherwise: number): number =>
    typeof value === "number" && Number.isFinite(value) ? value : otherwise;
  return {
    netScore: finite(ack.voteScore, fallback.netScore),
    upvotes: finite(ack.upvotes, fallback.upvotes),
    downvotes: finite(ack.downvotes, fallback.downvotes),
    userVote: toVoteValue(finite(ack.userVote, fallback.userVote)),
  };
}

/** Projects what the counters will read once `target` lands server-side.
 * Switching (e.g. down→up) moves one vote between buckets, so the net swings by 2. */
export function nextVoteState(state: VoteState, target: VoteValue): VoteState {
  const hadUp = state.userVote === 1;
  const hadDown = state.userVote === -1;

  const upvotes = state.upvotes - (hadUp ? 1 : 0) + (target === 1 ? 1 : 0);
  const downvotes = state.downvotes - (hadDown ? 1 : 0) + (target === -1 ? 1 : 0);

  return {
    netScore: upvotes - downvotes,
    upvotes,
    downvotes,
    userVote: target,
  };
}

export function formatNetScore(score: number): string {
  return score > 0 ? `+${score}` : `${score}`;
}

export function formatBreakdown(upvotes: number, downvotes: number): string {
  return `${upvotes} ↑ / ${downvotes} ↓`;
}
