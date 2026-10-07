/**
 * The feed node and its conversation tree — hand-written types for one
 * `publicSocialMediaLinks` row and its nested `sublinks` levels. Field names are copied
 * verbatim from the deployed schema. Split out of the former monolithic `home.queries.ts`;
 * the FEED_QUERY document itself lives in `home-feed.queries.ts`.
 */

import type { SocialMediaLinkStatus } from "./home.queries";

/** One feed node — the selected SocialMediaLinkScalar subset. */
export interface FeedLink {
  id: string;
  url: string;
  normalizedUrl: string | null;
  title: string;
  created: string;
  /** "When did this happen" — the instant the card shows and every ordering in
   * this file is built on (`publicSocialMediaLinks` orders `-occurredAt, -id`
   * and keysets/aligns day pages on the same column). NOT NULL on the backend,
   * backfilled from `COALESCE(posted_at, created)`, so every row has one.
   * `created` is NOT a substitute: it is "when someone reported it" and stays
   * the moderation provenance column. Naive local wall time, no offset. */
  occurredAt: string;
  /**
   * The conversation tree this node sits in (see `LinkCardItem` for the full contract). Unlike the
   * feed's other scalars, all four are REQUIRED here, because `FEED_QUERY` selects all four at
   * every level — an optional field on this type would be a hole the compiler could not report
   * (`strict`/`strictNullChecks` are OFF) and the wrapper would have to `?? 0` its way past.
   *
   * `parentId` is null exactly when this node IS a root, and `isThreadRoot` is defined as
   * `parentId == null` — which is also true of every ordinary ungrouped link, so neither may
   * decide whether to draw an expand affordance. `sublinkCount` is this node's OWN publicly-visible
   * descendant count at any depth, NOT the size of the conversation: to size a conversation, read
   * the ROOT's count. Summing it level by level double-counts by exactly the depth.
   */
  parentId: string | null;
  isThreadRoot: boolean;
  sublinkCount: number;
  /** This node's DIRECT children, in stored sibling `position` order, recursively nested four
   *  levels deep in the document. `[]` for a leaf — and a leaf is the common case. */
  sublinks: FeedLinkSublink[];
  /** The approval axis (`LIVE` / `PENDING_APPROVAL` / `HIDDEN`) — drives the shared card's
   * Pending pill. `HIDDEN` never reaches the public feed, so it only shows up in an admin
   * context (the console queue) or the submitter's own `mine` list. */
  status: SocialMediaLinkStatus;
  /** The separate admin "mark handled" flag (the console's own `completed` filter). */
  completed: boolean;
  /** True for rows written by the official-post ingestion (backend `is_automated`) — drives
   * the shared card's "Official" marker. False/absent for every hand-submitted link. */
  isAutomated: boolean;
  voteScore: number;
  userVote: number;
  voteBreakdown: { upvotes: number; downvotes: number };
  lines: Array<{ id: string; code: string; displayName: string }>;
  user: { shortId: string; nickname: string } | null;

  /* ---- The three EDIT ROUND-TRIP tag relations ------------------------------------ *
   * None of these is rendered by the card, and none is read by the vote overlay. They
   * are here for one reason, and it is a correctness reason rather than a display one.
   *
   * 🔴 `SocialMediaLinkInput` is REPLACE-NOT-PATCH. The update service assigns the title
   * and calls `.set()` on lines / vehicles / stations / categories UNCONDITIONALLY, so a
   * relation the payload does not carry is not left alone — it is BLANKED. The shared
   * edit sheet (`link-form.component.ts`) sends the complete editable set on save and
   * hydrates these three lists from the link being edited, which means a link that
   * arrives here WITHOUT them hydrates as an empty selection. An empty selection is
   * indistinguishable from "this link has no tags", so the save silently deletes the
   * row's real tags.
   *
   * That is why these three are REQUIRED on this type rather than optional: `FEED_QUERY`
   * selects all three at every level, and with `strict` OFF an optional key would be a
   * hole the compiler cannot report — the fixture would keep compiling while the server
   * sent nothing. `home.queries.spec.ts` pins the document itself (a type can say a key
   * exists; only the document says the server was asked for it).
   *
   * Selected with the MINIMUM identifying pair, and the same pair the flat
   * `PUBLIC_SOCIAL_MEDIA_LINKS_QUERY` and the console's `SocialMediaLinkRow` select for
   * the same three relations. `Vehicle` also exposes `vehicleType`, `incidents`,
   * `spottings` and `spottingTrends(...)`; widening the sub-selection to the whole
   * scalar would multiply payload AND resolver fan-out on every row of every feed page
   * for fields no consumer reads. `id` + the identifying field is exactly what the edit
   * form hydrates (`target.vehicles?.map((vehicle) => vehicle.id)`).
   *
   * Cost: `[]` on an untagged row — three empty arrays per level, against the `lines`
   * array already selected there — and `id` + one short string per tagged row. Small,
   * and it is the same shape `/insiden` already pays on every one of its rows.
   * Backend: `SocialMediaLinkScalar.vehicles: [Vehicle!]!`, `stations: [Station!]!`,
   * `categories: [CalendarIncidentCategoryScalar!]!` — all non-null, so a present array
   * is always a real value and `[]` genuinely means "no tags".
   */
  vehicles: Array<{ id: string; identificationNo: string }>;
  stations: Array<{ id: string; displayName: string }>;
  categories: Array<{ id: string; name: string }>;
}

/**
 * Everything a `FEED_QUERY` sublink level shares with its parent: the root's own fields minus the
 * two the nested selection does NOT request.
 *
 * `normalizedUrl` is dropped because the NESTED SELECTION DOES NOT REQUEST IT — nothing renders
 * it, and the document says so at the call site. Leaving it inherited would have this type claim a
 * REQUIRED key the document never sends, so a child could not be written by hand as a literal
 * without inventing a value the server did not send. It is omitted from the TYPE rather than added
 * to the query on purpose: adding a field no consumer reads to make a type look tidy trades a
 * harmless inaccuracy for a permanent cost on the wire. The root keeps `normalizedUrl` because
 * `FEED_QUERY` and `SUBMIT_FEED_LINK_MUTATION` both select it.
 *
 * `sublinks` is dropped here and re-added per level below, so each level's nesting depth is named
 * by a type rather than implied.
 */
type FeedLinkSublinkScalars = Omit<FeedLink, "normalizedUrl" | "sublinks">;

/**
 * Level 1 — the DIRECT children of a feed root, as selected by `FEED_QUERY`'s outermost
 * `sublinks` block.
 *
 * Spelled as an intersection over an `Omit<>` of the parent rather than as a hand-copied
 * interface, so a child can never drift from its parent — the exact failure mode a structural
 * contract like `LinkCardItem` is designed to make impossible: the moment a level forgets
 * `voteBreakdown` or `created`, this type is what notices. It satisfies `LinkCardItem`
 * structurally (every required field is present, and every tree field it declares optional), which
 * is what lets the recursive thread wrapper render a child with no host-side mapping.
 */
export type FeedLinkSublink = FeedLinkSublinkScalars & {
  sublinks: FeedLinkSublinkLevel2[];
};

/** Level 2 — the direct children of a level-1 sublink. Same selection, one block deeper. */
export type FeedLinkSublinkLevel2 = FeedLinkSublinkScalars & {
  sublinks: FeedLinkSublinkLevel3[];
};

/** Level 3 — the direct children of a level-2 sublink.
 *
 * This is the DEEPEST level the server stores: `MAX_THREAD_DEPTH = 3` counts a root as depth 0, so
 * a level-3 sublink is a leaf whose `sublinks` is always `[]`. It is a real, reachable, votable
 * card — the whole point of selecting this deep is that a 3-level conversation renders in full. */
export type FeedLinkSublinkLevel3 = FeedLinkSublinkScalars & {
  sublinks: FeedLinkSublinkLevel4[];
};

/**
 * Level 4 — the level the document DOES select `sublinks` at, but the TYPE stops short of.
 *
 * That asymmetry is deliberate on both sides and each half is correct. The document keeps the
 * fourth block so the nesting is one number a reader can check against `MAX_THREAD_DEPTH` and a
 * future cap bump needs no document change; the type stops at level 3 because the server answers
 * `[]` for a level it holds nothing under (verified, not just documented), so a level-4 node is
 * never actually materialised and declaring a `sublinks` key it never receives would be a small
 * lie. `LinkCardItem.sublinks` is optional, so a level-4 node would still satisfy the card
 * contract and render as a plain card.
 */
export type FeedLinkSublinkLevel4 = FeedLinkSublinkScalars;

export interface FeedLinkEdge {
  node: FeedLink;
  cursor: string;
}

export interface FeedLinkPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}
