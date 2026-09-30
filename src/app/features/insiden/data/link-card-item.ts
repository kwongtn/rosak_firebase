/** One line tag as the shared link card renders it (code badge, `displayName` in the title attr). */
interface LinkCardItemLine {
  id: string;
  code: string;
  displayName: string;
}

/**
 * Structural contract for one row of the shared link card (`app-link-card`). Deliberately NOT
 * `PublicSocialMediaLink`: the home feed's `FeedLink` node and the insiden/situasi
 * `PublicSocialMediaLink` node each satisfy this shape directly, which is what lets one card serve
 * every surface with no mapping at the host. Required fields are the ones every surface always
 * selects; `status`, `completed`, `isAutomated` and the vote triple are optional so a host that
 * doesn't select them (or a spec fixture) still satisfies the contract — the card falls back to
 * `0`/hidden.
 *
 * The `occurredAt` + thread fields below follow the same optionality rule, with one hard
 * constraint: `created` stays REQUIRED, because it is the card's fallback display instant
 * (`occurredAt ?? created`) and the tooltip's absolute timestamp. A node that selects
 * `occurredAt` but omits `created` would render a blank time, so every document that selects
 * the thread fields must keep selecting `created` alongside them — including the nested
 * `threadLinks` sub-selection in `FEED_QUERY`, whose members are themselves rendered as cards.
 */
export interface LinkCardItem {
  id: string;
  url: string;
  title: string;
  created: string;
  lines: LinkCardItemLine[];
  /** Submitter identity — null for legacy rows; drives the time tooltip's name. */
  user?: { shortId: string; nickname: string } | null;
  /**
   * The approval axis (`LIVE` / `PENDING_APPROVAL`). This is what drives the Pending pill and the
   * list's approved-vs-pending split. Kept as a plain `string | null` — not the narrow
   * `SocialMediaLinkStatus` union — so both source node types satisfy this interface structurally:
   * `FeedLink.status` is the union and `PublicSocialMediaLink.status` is `string | null`.
   */
  status?: string | null;
  /**
   * The separate admin "mark handled" flag (the console's own `completed` filter and
   * mark-completed action). It is NOT the approval state and must never drive the Pending pill.
   */
  completed?: boolean;
  /**
   * Provenance marker (backend `isAutomated`): true only for rows written by the official-post
   * ingestion, false/absent for every hand-submitted link. Drives the card's "Official" chip, so
   * a rider can tell an automatically captured operator post from a community submission. Only
   * the home feed's `FEED_QUERY` selects it today — the other hosts leave it undefined and the
   * chip simply stays hidden.
   */
  isAutomated?: boolean;
  voteScore?: number;
  userVote?: number;
  voteBreakdown?: { upvotes: number; downvotes: number };

  /* ---- occurred_at (the "when did this happen" instant) ------------------ *
   * `created` is "when did someone report it" and stays the moderation
   * provenance column; every feed/queue ordering and the card's displayed
   * timestamp key on `occurredAt` instead. The backend column is NOT NULL
   * (`social_models.SocialMediaLink.occurred_at`, indexed, backfilled from
   * `COALESCE(posted_at, created)`), so a `string` that is PRESENT is always a
   * real value — `undefined` means only "this host didn't select it". The card
   * reads `occurredAt ?? created`, which is why the fallback chain matters.
   *
   * Naive local wall time: the backend runs `USE_TZ = False` with
   * `TIME_ZONE = Asia/Kuala_Lumpur`, so this string carries NO offset. Never
   * run it through `new Date(...).toISOString()` — that would convert to UTC
   * and shift the value by 8 hours. `link-occurred-at.util.ts` owns the
   * datetime-local <-> ISO conversion.
   */
  occurredAt?: string;

  /* ---- Thread grouping (self-referencing FK, depth 1 by model invariant) --
   * A thread is root + members; `thread` always points at a ROOT, so a member
   * is never itself a root and there is no recursion to render. Visibility rule
   * that couples the whole group: a thread is public iff its ROOT is public, so
   * a HIDDEN root hides every member from a collapsed public feed. That is why
   * `threadSize`/`threadLinks` count only publicly-visible members — a badge
   * must never advertise a link that resolves into moderation.
   */

  /** Id of the thread root this link belongs to; `null` exactly when this link
   *  IS a root (which also covers an ordinary unthreaded link — the degenerate
   *  one-member thread). Backend `SocialMediaLinkScalar.threadId: ID`. */
  threadId?: string | null;

  /** True for thread roots — including plain unthreaded links, since
   *  `thread == null` IS the definition of a root. Drives "render me as a root"
   *  on the host; the card itself never renders thread UI. */
  isThreadRoot?: boolean;

  /** `1 + count(publicly-visible members)` — the number the "N links" badge
   *  shows, counting the root as 1. `1` for an unthreaded link. */
  threadSize?: number;

  /** The publicly-visible members of this link's thread, `occurredAt ASC, id
   *  ASC` (oldest first — a thread reads as a timeline). Members only: the root
   *  is never included, and the list is `[]` for an unthreaded link. Typed as
   *  `LinkCardItem[]` because every member is rendered by the same card: a
   *  host may pass one straight to `app-link-card` with no mapping. The
   *  recursive reference is deliberate — it is what makes "the nested selection
   *  must carry every field the card reads" a type-level requirement rather
   *  than a review comment. */
  threadLinks?: LinkCardItem[];
}
