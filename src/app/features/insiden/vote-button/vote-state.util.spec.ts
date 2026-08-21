import { describe, expect, it } from "vitest";
import { formatBreakdown, formatNetScore, nextVoteState, type VoteState } from "./vote-state.util";

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
