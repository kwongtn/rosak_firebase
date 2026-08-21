/**
 * Pure vote-state math behind the vote button: optimistic projections (including
 * switch deltas), removal, and display formatting. Free of Angular so the exact
 * numbers users see before/after a click are unit-testable in isolation.
 */

export type VoteValue = -1 | 0 | 1;

export interface VoteState {
  readonly netScore: number;
  readonly upvotes: number;
  readonly downvotes: number;
  /** The current user's own vote: 1 up, -1 down, 0 none. */
  readonly userVote: VoteValue;
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
