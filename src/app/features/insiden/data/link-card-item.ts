/** One line tag as the shared link card renders it (code badge, `displayName` in the title attr). */
export interface LinkCardItemLine {
  id: string;
  code: string;
  displayName: string;
}

/**
 * Structural contract for one row of the shared link card (`app-link-card`). Deliberately NOT
 * `PublicSocialMediaLink`: the home feed's `FeedLink` node and the insiden/situasi
 * `PublicSocialMediaLink` node each satisfy this shape directly, which is what lets one card serve
 * every surface with no mapping at the host. Required fields are the ones every surface always
 * selects; `completed` and the vote triple are optional so a host that doesn't select them (or a
 * spec fixture) still satisfies the contract — the card falls back to `0`/hidden.
 */
export interface LinkCardItem {
  id: string;
  url: string;
  title: string;
  created: string;
  lines: LinkCardItemLine[];
  /** Submitter identity — null for legacy rows; drives the time tooltip's name. */
  user?: { shortId: string; nickname: string } | null;
  /** Approved (true) vs awaiting admin approval (falsey) — drives the Pending pill. */
  completed?: boolean;
  voteScore?: number;
  userVote?: number;
  voteBreakdown?: { upvotes: number; downvotes: number };
}
