import type { FeedLink, FeedLinkEdge, FeedLinkPageInfo } from "./home.queries";

/** Links per GraphQL page: the initial read and every `loadMore()` continuation ask for this
 * many. A fetch size only — the page renders every loaded link and "Load More" pulls one
 * more continuation page. */
export const FEED_PAGE_SIZE = 8;

/** Links per page for the collapsed "Last Week" section. Larger than the today feed because it
 * spans up to seven calendar days; `alignPageToDay` keeps a page from ending mid-day. */
export const LAST_WEEK_PAGE_SIZE = 20;

/**
 * Links the Pro dashboard's OFFICIAL-NOTICES archive asks for.
 *
 * Far larger than the two rendered feeds' page sizes on purpose: those pages are the reader's
 * scrolling list, where eight rows is a screenful and every extra row is a query the reader pays
 * for. The archive is a reference panel, not a list to scroll — the reader wants "is there an
 * operator statement about this", and the cost of answering that from the newest 8 public links is
 * that an official post from last month is simply not in them. Fifty covers a Pro reader's whole
 * plausible window, and the panel shows what it holds rather than claiming the rest does not exist.
 *
 * The number is the FETCH size and nothing more: the archive renders every official row it is given
 * (there is no Load More and no pagination affordance), so this doubles as the honest upper bound
 * on what the panel can show.
 */
export const OFFICIAL_NOTICES_PAGE_SIZE = 50;

/**
 * The shared `collapseThreads` argument for every home-feed read — the two `graphqlResource`s, their
 * two `loadMore*` continuations, and the two authenticated vote-overlay reads.
 *
 * This is REQUIRED, not a cosmetic grouping preference, and the reason is the feed's ordering.
 * Every link list is ordered `occurredAt DESC, id DESC`, and a thread's members are NOT generally
 * adjacent in that order: an admin can group a 09:00 post with an 11:00 post, and the feed happily
 * returns two rows several positions apart — potentially on different pages. Client-side grouping of
 * a flat page is therefore unsound: a sublink can arrive with its root nowhere on the page, and the
 * two would render as two unrelated links.
 *
 * Collapsing pushes the decision to the backend, which returns conversation ROOTS only and nests each
 * one's whole subtree under `sublinks` — a self-contained unit that needs no second request. Two
 * consequences that make this the right call rather than merely a tidier one:
 * - `totalCount` counts ROOTS while collapsing, so the page's "Showing N of M" keeps counting the
 *   rows it actually renders instead of inflating behind conversations the user has not expanded.
 * - The continuation pages MUST agree with the first page. A collapsed first page followed by an
 *   uncollapsed continuation would list every root twice and render its sublinks as loose rows,
 *   which is why this constant is spread into `loadMore()`/`loadMoreLastWeek()` too.
 *
 * Deliberately the ONLY surface that collapses (plan decision 4): the /insiden tab, the situasi tab
 * and My Links stay flat lists and must not send this flag.
 *
 * SSR-safe: a compile-time constant, so the server render and the client hydration compute identical
 * variables and the TransferState payload is reused instead of refetched — the reason the last-week
 * window is a backend-computed boolean rather than a `new Date()` baked into the variables.
 */
export const HOME_FEED_COLLAPSE_VARS = { collapseThreads: true } as const;

/**
 * The ONE variables object the official-notices archive read is ever sent with.
 *
 * A compile-time constant for the reason every other home-feed variables object is one: the server
 * render and the client hydration must compute STRUCTURALLY IDENTICAL variables or the SSR
 * TransferState payload is discarded and the read fires twice. There is no `new Date()` here and no
 * client clock of any kind, which is what lets the archive exist at all (see below).
 *
 * 🔴 **NO WINDOW FLAGS — that is the archive.** Neither `currentServiceDayOnly` (backend default
 * `false`) nor `lastWeekOnly` (default `false`) is sent, so the read asks for the newest
 * {@link OFFICIAL_NOTICES_PAGE_SIZE} public `LIVE` links of ALL time. An operator statement from
 * nine days ago is still an operator statement, and a windowed read would answer a different
 * question than the panel claims to answer. Computing a window on this side instead would need a
 * date, and a date in query variables breaks SSR's variable equality — so the archive is built from
 * the ordering the backend already applies (`occurredAt DESC, id DESC`) rather than from a
 * client-side cut.
 *
 * `collapseThreads` is spread in for the same reason the two rendered feeds carry it, and the
 * effect matters for this panel too: with it, one conversation root arrives with its whole subtree
 * nested, so the newest 50 rows really are 50 cards' worth of history rather than 50 rows of a few
 * threads. Without it, a page dominated by conversations would drop most of the operator's older
 * posts off the end. (This read is deliberately NOT part of the vote-overlay id set — the archive
 * renders no votes; see the widget's own doc.)
 */
export const OFFICIAL_NOTICES_VARS = Object.freeze({
  first: OFFICIAL_NOTICES_PAGE_SIZE,
  status: "LIVE",
  ...HOME_FEED_COLLAPSE_VARS,
} as const);

/**
 * Merge helper for a refetched first page + already-appended continuation pages, de-duplicated by
 * `node.id` and keeping the FIRST occurrence (i.e. the backend's own order: first page first).
 *
 * This is a correctness requirement, not tidiness. The poll beat / manual refresh re-reads page one
 * WITHOUT dropping the appended pages (dropping them would wipe the user's Load More progress every
 * 30s — see `reloadFirstPages()`), and the two sets can then legitimately OVERLAP: an admin edit
 * between the two reads moves a row, so a row an appended page already holds comes back INTO page
 * one and the same id lands in both. A duplicate id is not cosmetic — the page renders
 * `@for (link of store.feedLinks(); track link.id)`, and a repeated track key throws on the next
 * render of that view. First-wins keeps the newest refetched copy for a row that is in both.
 *
 * SCOPE — OVERLAP ONLY, and that limit is load-bearing rather than an omission. The other
 * consequence of preserving appended pages is INVISIBLE to this merge: a row DELETED (or aged out
 * of the window) between the two reads is simply ABSENT from the refetched page one, while its
 * older copy is still sitting in an appended page. Dedupe can only see the ids it is GIVEN, and the
 * appended copy is still given, so that row keeps rendering — correctly as far as this function is
 * concerned, because "one id, one row" is the whole of its contract. See `reloadFirstPages()` for
 * when such a row is actually cleared.
 */
export function dedupeEdges(edges: FeedLinkEdge[]): FeedLinkEdge[] {
  const seenIds = new Set<string>();
  const merged: FeedLinkEdge[] = [];
  for (const edge of edges) {
    if (seenIds.has(edge.node.id)) {
      continue;
    }
    seenIds.add(edge.node.id);
    merged.push(edge);
  }
  return merged;
}

/**
 * One node of a collapsed feed conversation, as far as the VOTE OVERLAY walk cares: the id the
 * overlay is keyed by, the row's own `userVote`, and the children to recurse into.
 *
 * Declared structurally rather than as `FeedLink` or one of the `FEED_QUERY` sublink levels,
 * because the walk has to accept ALL of them: `FEED_QUERY` nests `sublinks` four levels deep and
 * each level is its own derived type (they stop at different depths), so naming any single one
 * would type the recursion at exactly one level — which is the bug this function exists to fix.
 * `sublinks` is OPTIONAL here because the deepest level selects no children at all, and a target
 * property that may be absent is satisfied by a source type that omits it. Every level's `id` /
 * `userVote` are required in its own type, so nothing unchecked reaches the overlay.
 */
export interface VoteOverlayNode {
  id: string;
  userVote: number;
  sublinks?: VoteOverlayNode[] | null;
}

/**
 * Record every non-zero vote in one conversation's whole subtree into `overlay`, mutating it in
 * place — the overlay map is a local accumulator, never a signal, so the reference-based
 * reactivity this rule is used from does not apply inside it.
 *
 * The RECURSION is the point, and it is unbounded on purpose. The collapsed feed renders a root
 * plus its entire tree, and every node in that tree is a votable card, so the set of ids the page
 * can draw is `∪ over every level of sublinks` — not just the roots and not just their direct
 * children. A walk that stopped at either of those two levels shipped as a live bug: the reads
 * were correctly collapsed and window-matched, and members one level down still read as the
 * ANONYMOUS zero, because a missing overlay entry falls back to `link.userVote`, which for
 * `graphqlResource` data is always 0. So: no depth limit, no `MAX_THREAD_DEPTH` mirror, and no
 * early exit — the server's write-side cap is not the client business, and a client that mirrors
 * it silently loses a level the day the cap moves.
 *
 * Only NON-ZERO votes are recorded, so the overlay never shadows a genuine anonymous 0. `?? []`
 * because `strictNullChecks` is OFF: a hand-built fixture or a partially cached payload must not
 * throw inside this fire-and-forget walk.
 */
export function recordSubtreeVotes(node: VoteOverlayNode, overlay: Record<string, number>): void {
  if (node.userVote !== 0) {
    overlay[node.id] = node.userVote;
  }
  for (const child of node.sublinks ?? []) {
    recordSubtreeVotes(child, overlay);
  }
}

/**
 * Merges a resource's own first-page `pageInfo` with the appended continuation's cursor/has-next,
 * or `null` until the first page has landed. `??` (not `||`): an appended `false` must win over a
 * stale first-page `true`, while an absent (`null`) appended reading falls back to the first page.
 */
export function mergeFeedPageInfo(
  first: FeedLinkPageInfo | null,
  appendedHasNext: boolean | null,
  cursor: string | null,
): FeedLinkPageInfo | null {
  if (!first) {
    return null;
  }
  return {
    hasNextPage: appendedHasNext ?? first.hasNextPage,
    endCursor: cursor ?? first.endCursor,
  };
}

/**
 * The "Showing N of M" denominator — `Math.max` of the live first-page total and the appended
 * reading, never `appendedTotalCount() ?? first ?? 0`.
 *
 * That chain made the frozen appended total WIN over the live first-page one, and the beat
 * refreshes page one while every appended signal is deliberately left alone (see
 * `reloadFirstPages()`) — so the appended reading is pinned at whatever the last continuation page
 * happened to report and can silently disagree with the refreshed page one in either direction. The
 * LIVE first-page total is the authoritative one (the same collapsed-roots count the resource's own
 * `edges` came back with), and the appended total is only ever another reading of the same
 * connection, so the larger of the two is never a lie: it is also the rule that a denominator must
 * never be smaller than EITHER source, because a shrink under a reader who has already loaded more
 * pages than the stale count knew about is the one reading that is visibly wrong ("Showing 40 of
 * 12").
 */
export function maxFeedTotalCount(
  appendedTotalCount: number | null,
  firstPageTotalCount: number | null,
): number {
  return Math.max(appendedTotalCount ?? 0, firstPageTotalCount ?? 0);
}

/** The caller's vote for a link: overlay first, else the anonymous feed value, else 0. */
export function resolveUserVote(
  overlay: Record<string, number>,
  feedLinks: readonly FeedLink[],
  linkId: string,
): number {
  const overlayValue = overlay[linkId];
  if (overlayValue !== undefined) {
    return overlayValue;
  }
  return feedLinks.find((link) => link.id === linkId)?.userVote ?? 0;
}
