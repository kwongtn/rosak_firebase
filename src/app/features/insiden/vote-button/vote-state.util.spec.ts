import { describe, expect, it } from "vitest";
import {
  formatBreakdown,
  formatNetScore,
  nextVoteState,
  toVoteValue,
  type VoteState,
  voteStateFromAcknowledgement,
  voteStatsKey,
} from "./vote-state.util";

const state: VoteState = {
  netScore: 5,
  upvotes: 12,
  downvotes: 7,
  userVote: 0,
};

describe("formatNetScore", () => {
  it("displays the net score with an explicit + prefix for positives", () => {
    expect(formatNetScore(5)).toBe("+5");
  });

  it("keeps the minus sign for negatives and shows a bare zero", () => {
    expect(formatNetScore(-2)).toBe("-2");
    expect(formatNetScore(0)).toBe("0");
  });
});

describe("toVoteValue", () => {
  it("passes the three legal votes through", () => {
    expect(toVoteValue(1)).toBe(1);
    expect(toVoteValue(0)).toBe(0);
    expect(toVoteValue(-1)).toBe(-1);
  });

  it("reads anything else as no vote", () => {
    // `strict` is OFF repo-wide and the wire type is a plain number, so an out-of-range or
    // absent value is reachable. It must clamp, not leak into the aria-pressed comparisons.
    expect(toVoteValue(2)).toBe(0);
    expect(toVoteValue(-7)).toBe(0);
    expect(toVoteValue(Number.NaN)).toBe(0);
    expect(toVoteValue(undefined as unknown as number)).toBe(0);
  });
});

describe("voteStatsKey — the staleness test for an acknowledged snapshot", () => {
  it("ignores the caller's own vote, so the host's echo of it is not new data", () => {
    // 🔴 LOAD-BEARING. The host writes the acknowledged `userVote` back down, which re-renders
    // the control. If the key included it, every vote would immediately invalidate its own
    // snapshot and the score would snap back to the pre-click numbers.
    const before: VoteState = { netScore: 5, upvotes: 12, downvotes: 7, userVote: 0 };
    const after: VoteState = { ...before, userVote: 1 };
    expect(voteStatsKey(before)).toBe(voteStatsKey(after));
  });

  it("moves on any counter change, which is what a real refetch looks like", () => {
    expect(voteStatsKey(state)).not.toBe(voteStatsKey({ ...state, netScore: 6 }));
    expect(voteStatsKey(state)).not.toBe(voteStatsKey({ ...state, upvotes: 13 }));
    expect(voteStatsKey(state)).not.toBe(voteStatsKey({ ...state, downvotes: 8 }));
  });
});

describe("voteStateFromAcknowledgement", () => {
  it("takes every number from the server, including a value it did not project", () => {
    const acknowledged = voteStateFromAcknowledgement(
      { userVote: -1, voteScore: 11, upvotes: 15, downvotes: 4 },
      { netScore: 4, upvotes: 12, downvotes: 8, userVote: -1 },
    );
    expect(acknowledged).toEqual({ netScore: 11, upvotes: 15, downvotes: 4, userVote: -1 });
  });

  it("returns the fallback untouched for a missing acknowledgement", () => {
    const projected: VoteState = { netScore: 6, upvotes: 13, downvotes: 7, userVote: 1 };
    expect(voteStateFromAcknowledgement(null, projected)).toBe(projected);
    expect(voteStateFromAcknowledgement(undefined, projected)).toBe(projected);
  });

  it("degrades a partial payload field-by-field instead of painting undefined", () => {
    // A cached or half-selected response must not blank the numbers the projection had.
    const projected: VoteState = { netScore: 6, upvotes: 13, downvotes: 7, userVote: 1 };
    const acknowledged = voteStateFromAcknowledgement(
      { userVote: 1, voteScore: undefined, upvotes: 13, downvotes: Number.NaN } as never,
      projected,
    );
    expect(acknowledged).toEqual({ netScore: 6, upvotes: 13, downvotes: 7, userVote: 1 });
  });

  it("keeps the caller's own vote when the payload does not carry one", () => {
    // 0 would be a LIE here, not a safe default: it un-lights an arrow the server may still
    // consider cast. A field we cannot read is a field we must not change.
    const projected: VoteState = { netScore: 6, upvotes: 13, downvotes: 7, userVote: 1 };
    const acknowledged = voteStateFromAcknowledgement(
      { voteScore: 6, upvotes: 13, downvotes: 7 } as never,
      projected,
    );
    expect(acknowledged.userVote).toBe(1);
  });

  it("clamps an out-of-range vote it WAS given, rather than passing it through", () => {
    const projected: VoteState = { netScore: 5, upvotes: 12, downvotes: 7, userVote: 0 };
    const acknowledged = voteStateFromAcknowledgement(
      { userVote: 4, voteScore: 5, upvotes: 12, downvotes: 7 },
      projected,
    );
    expect(acknowledged.userVote).toBe(0);
  });
});

describe("nextVoteState — toggle upvote on click", () => {
  it("adds the user's upvote to the optimistic projection", () => {
    const next = nextVoteState(state, 1);
    expect(next.userVote).toBe(1);
    expect(next.upvotes).toBe(13);
    expect(next.downvotes).toBe(7);
    expect(next.netScore).toBe(6);
  });
});

describe("nextVoteState — remove vote when clicking the same button", () => {
  it("withdraws the user's existing upvote", () => {
    const voted: VoteState = { ...state, netScore: 6, upvotes: 13, userVote: 1 };
    const next = nextVoteState(voted, 0);
    expect(next.userVote).toBe(0);
    expect(next.upvotes).toBe(12);
    expect(next.netScore).toBe(5);
  });

  it("withdraws the user's existing downvote", () => {
    const voted: VoteState = { ...state, netScore: 4, downvotes: 8, userVote: -1 };
    const next = nextVoteState(voted, 0);
    expect(next.downvotes).toBe(7);
    expect(next.netScore).toBe(5);
  });
});

describe("nextVoteState — switching votes", () => {
  it("moves one vote between buckets for a net swing of 2", () => {
    const voted: VoteState = { ...state, netScore: 4, downvotes: 8, userVote: -1 };
    const next = nextVoteState(voted, 1);
    expect(next.upvotes).toBe(13);
    expect(next.downvotes).toBe(7);
    expect(next.netScore).toBe(6);
    expect(next.netScore - voted.netScore).toBe(2);
  });

  it("switching up→down mirrors the swing", () => {
    const voted: VoteState = { ...state, netScore: 6, upvotes: 13, userVote: 1 };
    const next = nextVoteState(voted, -1);
    expect(next.netScore - voted.netScore).toBe(-2);
  });
});

describe("formatBreakdown", () => {
  it("renders the tooltip breakdown as up/down counts", () => {
    expect(formatBreakdown(12, 7)).toBe("12 ↑ / 7 ↓");
  });
});
