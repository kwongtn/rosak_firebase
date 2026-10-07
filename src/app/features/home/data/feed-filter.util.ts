import type { FeedLink } from "./home-feed-items";

/**
 * The Pro feed widget's client-side narrowing.
 *
 * 🔴 **Only ONE of these three axes belongs here.** The feed's LINE filter is the backend's:
 * `HomeStore.setLineFilter()` narrows `$lineId` on the connection itself, and it has to, because a
 * keyset cursor is only meaningful inside the query that minted it — filtering line-tagged rows out
 * of an unfiltered page and then continuing that page would splice unrelated links together. This
 * module is the remaining two axes (provenance and free text), which have to be client-side because
 * the connection exposes no argument for either.
 *
 * The `lineId` option below is still part of the contract, for the one caller that needs it as a
 * client-side check: the Pro widget passes the SAME line the server narrowed to, so a conversation
 * survives when its only mention of that line is on a member. It can never WIDEN past the server's
 * narrowing — a root the server did not return is not in the list at all — so re-checking it here is
 * consistency, not a second source of truth.
 *
 * **Sublinks are part of their root, and a filter NEVER removes one.** `FEED_QUERY` collapses
 * conversations, so each row a reader sees is a root plus its whole subtree, drawn by the recursive
 * `app-link-thread`. Two rules follow, and both are about not lying about what is on screen:
 *
 *  - A root is KEPT when a match is anywhere in its tree. A search for "Kajang" that dropped the row
 *    because only the reply mentioned Kajang would remove the very sentence that matched.
 *  - A root that is kept keeps its ENTIRE subtree, sublinks included. Dropping the non-matching
 *    members would quietly rewrite a conversation: the root's own `sublinkCount` chip would still
 *    say "4 links" over a row showing one, and a reader expanding it would find nothing there.
 *
 * Pure and Angular-free, so the whole rule is spec-able without a DOM.
 */

/**
 * The status axis of the Pro feed filter.
 *
 * 🔴 **NOT the link's approval state**, which is what the word "status" usually means on this
 * connection: both home feed resources request `status: "LIVE"`, so that axis is CONSTANT on this
 * read and a control over it would be a filter that provably never removes anything. The axis a Pro
 * reader actually asks about is provenance — "show me only what the operator published, or only what
 * the community filed" — which `isAutomated` answers exactly. `all` is the absence, and is what the
 * control renders as its default, matching the URL's own "a default never appears" rule.
 */
export type FeedLinkStatusFilter = "all" | "official" | "community";

/** Every accepted `?status=`-style value, for a control that builds its options from one table. */
export const FEED_LINK_STATUS_FILTERS: readonly FeedLinkStatusFilter[] = [
  "all",
  "official",
  "community",
];

/** One filter. Every key is optional and an absent key means "do not narrow on this axis". */
export interface FeedLinkFilter {
  /** Keep roots where this line appears on the root OR anywhere in its subtree. */
  lineId?: string | null;
  /** The provenance axis — see {@link FeedLinkStatusFilter}. */
  status?: FeedLinkStatusFilter | null;
  /** Case-insensitive free text over title, url, submitter and the row's line tags. */
  query?: string | null;
}

/**
 * One node of a collapsed conversation, as far as filtering cares: the fields the text match reads
 * and the children to recurse into.
 *
 * Declared STRUCTURALLY rather than as `FeedLink` or one of its `FEED_QUERY` levels, for the same
 * reason `HomeStore`'s vote walk does it that way: the document nests `sublinks` four levels deep
 * and every level is its own derived type, so naming any single one would type the recursion at
 * exactly one level — the bug that walk shipped once. Every field is optional because
 * `strictNullChecks` is OFF and a hand-built fixture must not throw inside a filter.
 */
interface FilterableNode {
  url?: string | null;
  title?: string | null;
  isAutomated?: boolean | null;
  user?: { shortId?: string | null; nickname?: string | null } | null;
  lines?: ReadonlyArray<{
    id?: string | null;
    code?: string | null;
    displayName?: string | null;
  }> | null;
  sublinks?: FilterableNode[] | null;
}

/**
 * Every node of one conversation, the root first.
 *
 * Iterative with an explicit stack rather than recursion for the same reason the vote walk
 * recurses instead: UNBOUNDED depth. The server caps the write side at `MAX_THREAD_DEPTH`, but a
 * client that mirrors that cap silently loses a level the day it moves, and a stack cannot blow the
 * call stack on a deep tree either.
 */
function conversationNodes(root: FilterableNode): FilterableNode[] {
  const nodes: FilterableNode[] = [root];
  const stack: FilterableNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    for (const child of node?.sublinks ?? []) {
      nodes.push(child);
      stack.push(child);
    }
  }
  return nodes;
}

/** One node's searchable text: the title, the URL, the submitter's two names, and its line tags. */
function searchableText(node: FilterableNode): string {
  const parts: string[] = [node.title ?? "", node.url ?? ""];
  const user = node.user;
  if (user) {
    parts.push(user.nickname ?? "", user.shortId ?? "");
  }
  for (const line of node.lines ?? []) {
    parts.push(line?.code ?? "", line?.displayName ?? "");
  }
  return parts.join(" ").toLowerCase();
}

/** Whether the line filter keeps this conversation: the line named on the root or on any member. */
function conversationMentionsLine(root: FilterableNode, lineId: string): boolean {
  return conversationNodes(root).some((node) =>
    (node.lines ?? []).some((line) => line?.id === lineId),
  );
}

/** Whether the provenance filter keeps this conversation: `official` if ANY node is operator-sourced. */
function conversationMatchesStatus(root: FilterableNode, status: FeedLinkStatusFilter): boolean {
  if (status === "all") {
    return true;
  }
  const official = conversationNodes(root).some((node) => node.isAutomated === true);
  return status === "official" ? official : !official;
}

/** Whether the text filter keeps this conversation: a match anywhere in its tree. */
function conversationMatchesQuery(root: FilterableNode, needle: string): boolean {
  return conversationNodes(root).some((node) => searchableText(node).includes(needle));
}

/**
 * The resident feed roots that survive every supplied axis, in their existing order.
 *
 * Returns the SAME root objects, never copies or partial rows: the widget hands each survivor to the
 * shared `app-link-thread`, which needs the whole conversation — including the members that did not
 * match — to render the card and size its own "N links" chip. Filtering members out is the one thing
 * this function must never do (see the module doc).
 *
 * Every axis is independent AND-ed, and an absent or blank axis narrows nothing. `query` is trimmed
 * and lower-cased ONCE here rather than per node, so the needle is byte-identical for every row.
 *
 * `FeedLink` is passed straight in: `FilterableNode` is what `FeedLink` already satisfies
 * structurally, which is exactly why that shape was declared optional rather than mirroring the
 * query types — a cast at each call site would be the alternative.
 */
export function filterFeedLinks<T extends FeedLink>(
  links: readonly T[],
  filter: FeedLinkFilter = {},
): T[] {
  const lineId = filter.lineId ?? null;
  const status = filter.status ?? "all";
  const query = (filter.query ?? "").trim().toLowerCase();

  return links.filter((link) => {
    if (lineId !== null && lineId !== "" && !conversationMentionsLine(link, lineId)) {
      return false;
    }
    if (!conversationMatchesStatus(link, status)) {
      return false;
    }
    if (query !== "" && !conversationMatchesQuery(link, query)) {
      return false;
    }
    return true;
  });
}
