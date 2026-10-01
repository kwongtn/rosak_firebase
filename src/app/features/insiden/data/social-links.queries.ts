import type { SocialMediaLinkStatus } from "../../home/data/home.queries";

interface PublicSocialMediaLinkLine {
  id: string;
  code: string;
  displayName: string;
}
interface PublicSocialMediaLinkVehicle {
  id: string;
  identificationNo: string;
}
interface PublicSocialMediaLinkStation {
  id: string;
  displayName: string;
}
/** One submitted link (the connection's `node`). `status` carries the approval
 * state (PENDING_APPROVAL for user submissions, LIVE for admin ones — Task 10);
 * `completed` keeps the pre-status contract the console uses. `user`/`categories`
 * are additive (Task 24 edit flow): `user.shortId` proves authorship for the edit
 * affordance, `categories` lets the edit form re-send the current tags. The vote
 * fields mirror the home FEED_QUERY node so the situasi list can host the vote
 * control.
 *
 * NOTE the deliberate looseness of this type, and the SCOPE of it: it is ALSO the node
 * type of the nested `links(first: 10)` sub-select in INSIDEN_INCIDENTS_QUERY,
 * which selects only `id url title occurredAt created status completed` — narrower
 * than this query on purpose. That is why the ADDITIVE fields are OPTIONAL here even
 * where the public query selects them (`user`, `categories`, and the tree block
 * below), so a narrower host selection still satisfies the type. The four tree
 * fields are the sharpest case of that rule (see below).
 *
 * It is NOT a blanket "every field may be missing" contract, and the required
 * `voteScore` / `userVote` / `voteBreakdown` / `lines` / `vehicles` / `stations` say so:
 * the incident card's rows are the compact `incidentLinkLine` anchors, not
 * `app-link-card`, so that surface reads none of them. A future host that DOES want
 * them must select them — and must not read them off a host that has not.
 *
 * `occurredAt` AND `created` are selected by BOTH hosts, and the pair is not a
 * duplicate: `occurredAt` is the display instant, `created` the fallback the display
 * path reads as `occurredAt ?? created`. Selecting both is load-bearing because the
 * incident card builds ONE list out of TWO documents — page 1 from that nested
 * sub-select, continuation pages from PUBLIC_SOCIAL_MEDIA_LINKS_QUERY below — so
 * every field the display reads must be selected by both, or the single list labels
 * its top 10 rows by one instant and its rows below by another. That invariant is
 * not visible from either document on its own, which is why neither may drop the
 * pair as "redundant". */
export interface PublicSocialMediaLink {
  id: string;
  url: string;
  title: string;
  created: string;
  /** "When did this happen" (NOT NULL on the backend) as opposed to `created`
   * ("when someone reported it"). Naive local wall time — the backend runs
   * `USE_TZ = False`, so the string carries no offset and must never be
   * re-formatted through UTC. Absent only on hosts that don't select it. */
  occurredAt?: string;
  /* ---- Conversation tree (see LinkCardItem for the full contract) --------- *
   * FOUR fields — `parentId`, `isThreadRoot`, `sublinkCount`, `position` — and all
   * four are OPTIONAL, for the same reason twice over:
   *   1. This type is ALSO the node of the nested `links(first: 10)`
   *      sub-select in INSIDEN_INCIDENTS_QUERY, which selects only SEVEN fields
   *      (`id url title occurredAt created status completed`) and NONE of those
   *      four. Any of them required here would make that narrower selection a lie
   *      `strictNullChecks` (off) would not catch, and would break the incident
   *      card, which builds ONE list out of TWO documents.
   *   2. `PUBLIC_SOCIAL_MEDIA_LINKS_QUERY` hosts the deliberately FLAT surfaces,
   *      which do not select `sublinks` at all (see that document's comment for
   *      why). A required `sublinks` would be a required key the document never
   *      sends.
   * ⚠️ Read #2 for what it says and not for more: `sublinks` is NOT one of the four
   * above — it is not declared on this interface at all (it belongs to
   * `LinkCardItem`, which is where a nesting host reads it, off FEED_QUERY). #2 is
   * recorded because it is the rule a `sublinks` on THIS type would have to follow.
   * The flat document withholds none of the four: it selects all of them,
   * `position` included, and reason #1 is what covers each one.
   * A host that omits all four still satisfies the interface and renders a plain
   * row, which is the correct outcome on a surface with no hierarchy UI. */
  /** Id of the link this one hangs under; `null` exactly when this link IS a root (which
   *  includes every ordinary ungrouped link). Backend `SocialMediaLinkScalar.parentId: ID`. */
  parentId?: string | null;
  /** True for roots — a ROOT MARKER, not a "has sublinks" marker: it is true for every
   *  ungrouped link too, so the only correct affordance test is `sublinkCount > 0`. Backend
   *  `SocialMediaLinkScalar.isThreadRoot: Boolean!`, defined as `parentId == null`. */
  isThreadRoot?: boolean;
  /** This node's OWN publicly-visible descendant count, at any depth; `0` for a leaf. NOT the
   *  size of the conversation — read the ROOT's count for that, and never sum level by level
   *  (that double-counts by exactly the depth). Publicly-visible only, so a count can never
   *  advertise a link that resolves into moderation. */
  sublinkCount?: number;
  /** This row's stored SIBLING SEQUENCE, gap-spaced `10, 20, 30, …` and ASC-ordered within
   *  ONE PARENT. Selected so the "My Submitted Links" reorder can build its payload from the
   *  stored order; the flat hosts on the same document ignore it.
   *
   *  OPTIONAL for the same reason the four fields above are: this type is also the node of the
   *  nested `links(first: 10)` sub-select, which selects no conversation field at all.
   *
   *  🔴 NOT UNIQUE. Every structural write renumbers the run to the exact series, but ungrouping
   *  promotes links to roots WITHOUT renumbering, so a promoted link can keep its old number
   *  and tie. A root's `parentId` is `null`, so every root is a sibling of every other root —
   *  sort a run by `position` and then `id`, never by `position` alone. And never by
   *  `occurredAt`: this document's own list order is `occurredAt DESC, id DESC`, which is NOT
   *  the order a reorder permutation must send. */
  position?: number;
  completed: boolean;
  status?: string | null;
  voteScore: number;
  userVote: number;
  voteBreakdown: { upvotes: number; downvotes: number };
  lines: PublicSocialMediaLinkLine[];
  vehicles: PublicSocialMediaLinkVehicle[];
  stations: PublicSocialMediaLinkStation[];
  user?: { shortId: string; nickname: string } | null;
  categories?: { id: string; name: string }[];
}
export interface PublicSocialMediaLinkEdge {
  node: PublicSocialMediaLink;
  cursor: string;
}
interface PublicSocialMediaLinkPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}
interface PublicSocialMediaLinksConnection {
  edges: PublicSocialMediaLinkEdge[];
  pageInfo: PublicSocialMediaLinkPageInfo;
}
export interface PublicSocialMediaLinksQueryData {
  publicSocialMediaLinks: PublicSocialMediaLinksConnection;
}
/**
 * Shared paginated links query (Task 10 keyset cursor + Task 16 infinite scroll).
 * The public tab passes only `first`/`after`; the incident card's continuation
 * pages pass `incidentId` with the cursor it got from the nested
 * `links(first, after)` scalar field — same ordering (occurredAt DESC, id DESC),
 * same cursor format (see rosak_backend incident/schema/keyset.py, which now
 * keysets on `<occurredAt iso>|<id>`). `lineId`
 * stays for the spotting line-details panel (first page only). `mine` (Task 23)
 * switches to the caller's own submissions (status-independent); the backend
 * returns an empty page for anonymous callers — the profile feature always
 * sends an idToken header alongside it (mirrors my-spottings, never
 * graphqlResource). `collapseThreads` swaps the flat row list for conversation
 * ROOTS and is only ever set by the home feed; see PublicSocialMediaLinksVars for
 * the null-vs-omit trap its `Boolean!` argument type makes load-bearing, and
 * FEED_QUERY for the one document that actually nests `sublinks`.
 */
export const PUBLIC_SOCIAL_MEDIA_LINKS_QUERY = `
  query PublicSocialMediaLinks(
    $first: Int = 20
    $after: String
    $lineId: ID
    $incidentId: ID
    $mine: Boolean
    $collapseThreads: Boolean
  ) {
    publicSocialMediaLinks(
      first: $first
      after: $after
      lineId: $lineId
      incidentId: $incidentId
      mine: $mine
      collapseThreads: $collapseThreads
    ) {
      edges {
        node {
          id
          url
          title
          created
          # "When did this happen" — the display instant and the leading key of
          # this feed's -occurredAt, -id ordering. Naive local wall time, no
          # offset (backend USE_TZ = False).
          occurredAt
          # Conversation tree, PARTIAL BY DESIGN — this is the flat surface.
          #
          # sublinks is DELIBERATELY NOT selected here, and that is a product
          # decision, not an omission. This document feeds /insiden, the situasi
          # tab and the per-incident sections, all of which show every link as its
          # OWN row: a sublink is a distinct thing that happened, not a detail of
          # its parent. Selecting the tree here would let a host sprout a "3 links"
          # chip pointing at an expansion that does not exist on these surfaces, and
          # the honest fix for that (deleting the chip) still leaves the bytes
          # wasted. The nested/expanding surface is the home feed, whose own
          # document is FEED_QUERY — the ONE surface that sends collapseThreads
          # and therefore the only one that nests.
          #
          # sublinkCount IS selected, so that a host is able to read a conversation's
          # size off a flat row and render it as a plain fact ("part of a 3-link
          # report") with no affordance attached. NO HOST DOES: app-link-list never
          # passes it down, and app-link-card gates its own chip on its OWN
          # sublinkCount INPUT (the input defaults to 0) rather than on
          # link.sublinkCount, so a flat surface cannot draw a chip even though it
          # has the number in hand. That is a product gap, not a data-layer one — this
          # document is the data the gap would be closed against, and closing it means
          # passing the value to the card, not selecting it again here.
          # 🔴 sublinkCount is this node's OWN descendant count, never the
          # conversation's size: read the ROOT's row for that, and never sum a
          # column of them (that double-counts by exactly the depth).
          # isThreadRoot is a ROOT MARKER, true for every ungrouped link, so it is a
          # valid "indent me / render me as a head" signal and an INVALID "does this
          # row expand" signal.
          parentId
          isThreadRoot
          sublinkCount
          # The STORED SIBLING SEQUENCE, which the "My Submitted Links" reorder
          # controls need and the other hosts on this document ignore.
          #
          # 🔴 ORDERING RULE FOR A SIBLING RUN — read this before sending a reorder.
          # reorderSocialMediaLinks PERMUTES one existing sibling set: it moves
          # nothing, it rewrites the entire run's positions from the list it is given
          # (10, 20, 30, … in that order). So the payload must be the run in the
          # STORED order with the one intended move applied, and NEVER the order this
          # list happens to arrive in — which is occurredAt DESC, id DESC, a
          # different ordering. Send the arrival order and the server writes it as the
          # conversation's sequence: the first reorder of an oldest-first conversation
          # reverses it and the round-trip does nothing. Build the run as: filter by
          # parentId (the roots are the null run), sort position ASC, then id
          # as the tie-break, then apply the move.
          #
          # ⚠️ id is NOT optional after position. Positions are gap-spaced and the
          # service renumbers a run to that exact series on every structural write —
          # except ungrouping, which promotes links to roots WITHOUT renumbering them,
          # so a promoted link keeps the number it held under its old parent and can
          # tie with a root that already holds it. Every root's parentId is null, so
          # all roots are siblings of each other and the root run is where the tie is
          # observable. Never treat position as a unique key.
          position
          status
          completed
          voteScore
          userVote
          voteBreakdown { upvotes downvotes }
          user { shortId nickname }
          lines { id code displayName }
          vehicles { id identificationNo }
          stations { id displayName }
          categories { id name }
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export interface PublicSocialMediaLinksVars {
  first?: number;
  after?: string | null;
  lineId?: string | null;
  incidentId?: string | null;
  mine?: boolean | null;
  /**
   * Collapse each conversation to its root row (the children arrive through the host's
   * own nested `sublinks` selection — FEED_QUERY's, since that is the only surface
   * that collapses). Deliberately NOT defaulted in the document and NOT
   * nullable here, because the backend argument is `collapseThreads: Boolean! =
   * false` — a NON-NULL type.
   *
   * ⚠️ Verified against the deployed schema: omitting the key entirely is fine
   * (Strawberry applies the `false` default), but sending an explicit
   * `collapseThreads: null` fails the whole operation with "Argument
   * 'collapseThreads' of non-null type 'Boolean!' must not be null". Hence
   * `boolean | undefined` rather than `boolean | null`: the type has to make the
   * fatal spelling unrepresentable. Never default it to false either — `false`
   * is a real value the resolver reads, and omitting the key is how you say
   * "use the schema default".
   *
   * Ignored server-side when `mine` is set (a personal list is never collapsed),
   * so a caller must not rely on it for My Links.
   */
  collapseThreads?: boolean;
}

/** Single source of truth for the link edit mutation — re-exported from the console file so
 * public-edit and console-edit never carry divergent copies (mirrors the
 * UPDATE_CALENDAR_INCIDENT_MUTATION pattern). Backend role rule: admin edits land live; a
 * submitter's edit goes back into the approval queue (PENDING_APPROVAL). */
export const UPDATE_SOCIAL_MEDIA_LINK_MUTATION = /* GraphQL */ `
  mutation UpdateSocialMediaLink($socialMediaLinkId: ID!, $input: SocialMediaLinkInput!) {
    updateSocialMediaLink(socialMediaLinkId: $socialMediaLinkId, input: $input) {
      ok
    }
  }
`;

export interface UpdateSocialMediaLinkVars {
  socialMediaLinkId: string;
  /** `SocialMediaLinkInput` is NOT a partial patch: `url` is required, and the
   *  backend service replaces `title` and the lines/vehicles/stations/categories
   *  M2M sets verbatim — an omitted `title` blanks it and an omitted id list
   *  strips every tag. Callers must therefore re-send the row's current
   *  scalars and ids even when they only mean to change `status`. */
  input: {
    url: string;
    title?: string | null;
    lineIds?: string[];
    vehicleIds?: string[];
    stationIds?: string[];
    categoryIds?: string[];
    /** Tri-state (backend `Maybe[datetime | None]`), and all three states differ:
     *  OMIT the key → leave the event time untouched; send a datetime string → set
     *  it; send an explicit `null` → RESET it to the row's submission time ("this
     *  happened when it was reported"). `null` is therefore the destructive
     *  spelling and must never be produced by a `row.occurredAt ?? null` accident —
     *  an editor that round-trips the row sends the string verbatim.
     *
     *  TRAP: because the input is replace-not-patch (see above), any payload that
     *  re-sends the row to change one field must include this key too, or the
     *  console's Approve/Hide verbs would silently reset every link's event time
     *  the moment this field started being coerced to null somewhere. See
     *  linkStatusInput, the single builder for the status-only verbs. */
    occurredAt?: string | null;
    /** Tri-state (backend `Maybe[SocialMediaLinkStatusInput]`): omit to leave the
     *  approval status untouched, send `"LIVE"` to publish (the console queue's
     *  Approve action) or `"HIDDEN"` to pull the row out of the public feed
     *  (its Hide action). */
    status?: SocialMediaLinkStatus;
  };
}

export interface UpdateSocialMediaLinkData {
  updateSocialMediaLink: { ok: boolean };
}

/* ---- Conversation grouping (the tree) ------------------------------------ *
 * `groupSocialMediaLinks` / `ungroupSocialMediaLinks` / `reorderSocialMediaLinks`
 * are dedicated id-only mutations rather than another mode of
 * `updateSocialMediaLink`, and that is load-bearing: `SocialMediaLinkInput` is
 * REPLACE-NOT-PATCH (see UpdateSocialMediaLinkVars above), so routing a grouping
 * action through it would blank `title` and strip all four M2M tag sets as a side
 * effect. All three send ids only and touch nothing else on the row.
 *
 * 🔴 There is deliberately NO grouping argument on `SocialMediaLinkInput`. The
 * tree is moved only through these mutations, which is what keeps the depth cap
 * (`MAX_THREAD_DEPTH`), the cycle rejection and the explicit `position` writes in
 * ONE place server-side. Do not add a `parentId` to the edit input "for
 * convenience": a replace-not-patch input is the wrong vehicle for a structural
 * move, and it would bypass every guard documented below.
 *
 * Backend: rosak_backend incident/schema/mutations/interactions.py →
 * incident/services/social_link_threads.py. The whole call is one
 * `transaction.atomic()` and is ALL-OR-NOTHING — if any id fails the
 * ownership/admin gate the entire selection is rejected, so a client never has
 * to render (or recover from) a partial group. Permission is admin-on-anything
 * or submitter-on-own-links, re-verified on the TARGET parent and on every moved
 * node, so a nest can never be used to borrow someone else's link as a container.
 */

/**
 * Group selected links under one parent; omit `parentId` to start a NEW conversation.
 *
 * `id` is the **new tree's TOP node's** id — for both modes — which is what lets
 * a caller refetch exactly one conversation afterwards instead of guessing which
 * of the rows it just sent is now the representative. The two modes:
 *
 *   - **No `parentId`** (or an explicit `null`) → START A NEW CONVERSATION. This is
 *     the opposite of what the argument's name suggests: it does NOT make the links
 *     independent roots. The service elects the link with the SMALLEST
 *     `(occurredAt, id)` among the selection as the root, lifts it out of whatever
 *     tree it was in (`parent = null`, so it becomes depth 0 rather than hanging off
 *     the thread it came from), and makes EVERY OTHER SELECTED LINK A DIRECT CHILD of
 *     it — ordered `(occurredAt, id)`, the same key the election uses. The order is
 *     `(occurredAt, id)` and not `(created, id)` because the root renders the card and
 *     a conversation reads oldest-first, and a submitter may backdate `occurredAt` to
 *     the disruption while filing today; `id` is only the tie-break between links
 *     sharing an instant, because "usually a total order" is not one.
 *     Positions are written EXPLICITLY to the `10, 20, 30, …` series rather than left
 *     to the tree library's read-then-write auto-assign, because re-parenting never
 *     recomputes them and an un-ordered sibling set is a rendering bug nobody can see
 *     in the response. Selecting ONE link and omitting `parentId` is therefore a
 *     no-op success (it is already this structure), NOT "detach it".
 *   - **With a `parentId`** → APPEND the selection as DIRECT children of that
 *     link, which may itself be a sublink: the tree is arbitrarily deep, so the
 *     target is NOT walked up to a root the way the old depth-1 design required. The
 *     returned `id` is still the conversation's TOP node in both modes — the target's
 *     own root is resolved for that one value and nothing is collapsed onto it.
 *
 *   TWO REJECTIONS, and both take the WHOLE CALL with NOTHING WRITTEN (one
 *   `transaction.atomic()`, every guard evaluated before the single `bulk_update`):
 *   - a **CYCLE** — the target is, or is a descendant of, one of the selected links.
 *     The degenerate "target is itself in the selection" (a link parented to itself) is
 *     the same check, not a second rule. The check walks UP from the single target, so
 *     it covers the entire selection in one query instead of testing one mover's
 *     subtree and sailing through on the other;
 *   - exceeding **`MAX_THREAD_DEPTH = 3`** — measured on the RESULTING depth, and on the
 *     subtree that TRAVELS WITH each moved node (re-parenting carries a node's
 *     descendants with it), so a node lifted out of a deep place is allowed and one
 *     sunk into a shallow one is not. A root is depth 0, so the cap admits four levels:
 *     root -> sublink -> sub-sublink -> leaf.
 *   The mutation is also refused outright for an empty list or a repeated id, and — for a
 *   non-admin — when ANY selected link, or the named target, belongs to someone else.
 *
 * ⚠️ `parentId` is `ID = null`: explicitly nullable WITH a default, so omitting the
 * key and sending `null` mean the same thing. That is the OPPOSITE of two
 * neighbouring arguments with the same-looking `ID`/`Boolean` type, and the three
 * shapes are worth keeping straight:
 *   - `collapseThreads: Boolean! = false` on PUBLIC_SOCIAL_MEDIA_LINKS_QUERY, where
 *     omitting the key is fine but an explicit `null` is a hard operation error;
 *   - `reorderSocialMediaLinks.parentId` (see below), which is `ID` — nullable and
 *     with NO default. A nullable argument cannot be made required in the SDL, so
 *     omitting the key there is LEGAL GraphQL and what refuses it is the RESOLVER's
 *     own guard; the variables object must still ALWAYS carry the key.
 * The type of each Vars interface has to keep those three distinct.
 *
 * Usage (from an event handler — never `httpResource`, whose
 * re-fetch-on-signal-change lifecycle is wrong for a one-shot write). The
 * `firebase-auth-key` header is REQUIRED, not decorative: both mutations are
 * `IsLoggedIn` and the ownership gate needs the caller's `common.User`, so an
 * omitted header fails as anonymous.
 *
 * ```ts
 * const idToken = await this.auth.idToken();
 * const data = await this.graphql.request<GroupSocialMediaLinksData, GroupSocialMediaLinksVars>(
 *   GROUP_SOCIAL_MEDIA_LINKS_MUTATION,
 *   {
 *     linkIds: selectedWithin(selectedIds(), visibleLinkIds()).filter(Boolean), // `[ID!]!`
 *     ...(targetParentId ? { parentId: targetParentId } : {}), // omit to start a new tree
 *   },
 *   idToken ? { "firebase-auth-key": idToken } : {},
 * );
 * // data.groupSocialMediaLinks.id -> refetch this ONE conversation. It is an Int.
 * ```
 */
export const GROUP_SOCIAL_MEDIA_LINKS_MUTATION = /* GraphQL */ `
  mutation GroupSocialMediaLinks($linkIds: [ID!]!, $parentId: ID) {
    groupSocialMediaLinks(linkIds: $linkIds, parentId: $parentId) {
      ok
      id
    }
  }
`;

export interface GroupSocialMediaLinksData {
  groupSocialMediaLinks: {
    ok: boolean;
    /**
     * The tree's top node id, so the caller can refetch exactly one conversation.
     *
     * ⚠️ Typed `number | null` because the backend returns `common.schema.scalars
     * .GenericMutationReturn.id: int | None` — GraphQL `Int`, NOT `ID`. Every
     * other id on this scalar is an `ID` (a string), and with `strict` OFF the
     * compiler will happily accept `linkIds: [String(result.id)]` … which is
     * fine — but it will equally happily let this be treated as one. `ungroup`
     * leaves it `null` (there is no row to name back); `group` always sets it.
     */
    id: number | null;
  };
}

export interface GroupSocialMediaLinksVars {
  /**
   * `[ID!]!` — the list and every ELEMENT are non-null, so an empty string is
   * a validation error rather than something the server tolerates. Filter
   * empties (`ids.filter(Boolean)`) before sending rather than trusting a
   * checkbox list to be clean. A duplicate id is also rejected outright
   * ("The selected social media links repeat an id.") — dedupe at the
   * selection layer; `toggleSelection` in `link-thread-selection.util.ts` is
   * idempotent, so a selection it produced can never contain one.
   */
  linkIds: string[];
  /**
   * Omit the key (or send `null`) to START A NEW CONVERSATION — which elects the earliest
   * `(occurredAt, id)` in `linkIds` as the root and nests the rest under it, NOT "make these
   * separate roots". Send a link id to make the selection that link's DIRECT children.
   * Typed `string | null | undefined`
   * because the backend argument is `ID = null` — unlike `collapseThreads:
   * Boolean! = false` on PublicSocialMediaLinksVars, where an explicit `null` is
   * fatal, and unlike `ReorderSocialMediaLinksVars.parentId`, where OMITTING is
   * what the resolver's guard refuses. See the mutation's doc comment before
   * spelling one the other way.
   *
   * The target may be any link the caller may touch, root or sublink — it is NOT
   * resolved up to a root, because the tree is arbitrarily deep. Sending a link
   * that is, or is a descendant of, one of `linkIds` is a cycle and is rejected, as is any
   * selection that would push a node past `MAX_THREAD_DEPTH` — both with nothing written.
   */
  parentId?: string | null;
}

/**
 * Set the SIBLING ORDER of one existing set of children. `ok` only, with **no `id`**.
 *
 * 🔴 This is a PERMUTATION of one sibling set, not a move. Every id sent must
 * ALREADY be a child of `parentId`; the server rejects anything else. To change
 * which parent a link hangs under, use `GROUP_SOCIAL_MEDIA_LINKS_MUTATION` (append
 * under a new target) or `UNGROUP_SOCIAL_MEDIA_LINKS_MUTATION` (promote to a
 * root) — calling reorder with a foreign id is an error, not a re-parent. That
 * split is deliberate: re-parenting has to run the cycle check and the depth cap
 * and re-verify permission on the target, and folding that into a reorder verb
 * would make an ordinary drag a structural, all-or-nothing change.
 *
 * The order written is the STORED sibling `position` — the same ordering
 * `sublinks` comes back in, and deliberately NOT the `occurredAt DESC, id DESC`
 * that every other link list uses. A conversation is a narrative with an
 * author-chosen sequence, not a timeline.
 *
 * 🔴 SO A CLIENT MUST SEND THE STORED ORDER, NOT THE ARRIVAL ORDER. Both flat link
 * documents select `position` for exactly this (see `PublicSocialMediaLink.position`
 * and the console's `SocialMediaLinkRow.position`): read the run off the page, sort it
 * `position` ASC then `id` (positions can tie — a promoted root keeps its old number —
 * so `id` is a required tie-break, not a nicety), apply the ONE move, and send that. A
 * run derived from the row array's own order is a different ordering, and because this
 * is a permutation rather than a move, the server writes it verbatim as the new
 * sequence: the first reorder of an oldest-first conversation reverses it and nothing
 * round-trips.
 *
 * 🔴 `parentId` is `ID` — NULLABLE, WITH NO SDL DEFAULT — which is NOT the same thing
 * as "required". The backend signature is
 * `reorderSocialMediaLinks(linkIds: [ID!]!, parentId: ID)`, and in GraphQL "required"
 * IS "non-null", so a nullable argument is plain OPTIONAL: omitting the key is LEGAL
 * GraphQL, `ProvidedRequiredArgumentsRule` never fires for it, and what refuses it is
 * the RESOLVER'S OWN GUARD (`interactions.py` raises the `GraphQLError`) —
 * deliberately, at execution time. It cannot be tightened to `ID!`, because the
 * meaningful `null` ("reorder the ROOTS") would then become a hard error: the SDL
 * cannot express the omitted-vs-null distinction, so the guard does it instead.
 * Hence all three of these are mandatory together anyway: the document must SUPPLY
 * the argument (`parentId: $parentId`), the variable must be declared nullable
 * (`$parentId: ID`, never `$parentId: ID!`), and the variables object must ALWAYS
 * carry the key — `null` reorders the roots, an id reorders that parent's
 * children. Contrast `groupSocialMediaLinks`, whose `parentId: ID = null` has a
 * default, so omitting there is fine and means the same thing. Getting this backwards
 * either rejects the call or, worse, surfaces as an unrelated argument error on a
 * mutation whose semantics look unambiguous.
 *
 * Same `firebase-auth-key` requirement and the same one-shot-write shape as the
 * group verbs:
 *
 * ```ts
 * const idToken = await this.auth.idToken();
 * await this.graphql.request<ReorderSocialMediaLinksData, ReorderSocialMediaLinksVars>(
 *   REORDER_SOCIAL_MEDIA_LINKS_MUTATION,
 *   {
 *     linkIds: orderedSiblingIds, // every one already a child of parentId
 *     parentId: row.parentId,     // REQUIRED KEY — null reorders the roots
 *   },
 *   idToken ? { "firebase-auth-key": idToken } : {},
 * );
 * ```
 */
export const REORDER_SOCIAL_MEDIA_LINKS_MUTATION = /* GraphQL */ `
  mutation ReorderSocialMediaLinks($linkIds: [ID!]!, $parentId: ID) {
    reorderSocialMediaLinks(linkIds: $linkIds, parentId: $parentId) {
      ok
    }
  }
`;

export interface ReorderSocialMediaLinksData {
  /** `id` is absent from this selection on purpose: a reorder names back no row and
   *  changes no link's parent, so there is nothing to refetch by id. Refetch the list
   *  (or the one conversation) instead — and note this payload carries NO sequence
   *  back, so a client cannot confirm the order it just wrote without the refetch. Both
   *  flat link documents DO select `position` (`PUBLIC_SOCIAL_MEDIA_LINKS_QUERY` and the
   *  console's `SOCIAL_MEDIA_LINKS_QUERY`), so the refetch can now render the stored
   *  order instead of guessing it from the arrival order. */
  reorderSocialMediaLinks: { ok: boolean };
}

export interface ReorderSocialMediaLinksVars {
  /**
   * The sibling set in its NEW order, and 🔴 "its order" means the STORED one
   * (`position` ASC, then `id`) with the intended move applied — not the order the
   * rows arrived in. Same `[ID!]!` constraints as the group verbs
   * (non-null elements, no repeats) plus one specific to this mutation: the server
   * treats the payload as a permutation of the EXISTING child set of `parentId`, so
   * a partial list, a foreign id, or an id that is not a child at all is rejected
   * rather than partially applied. Send the WHOLE sibling set, re-ordered — never
   * just the two rows the user dragged past each other.
   */
  linkIds: string[];
  /**
   * 🔴 The parent whose children are being re-ordered: `null` = the roots.
   *
   * Typed `string | null` and NOT `string | null | undefined`, on purpose. The
   * backend argument is `ID` — nullable, and with NO default, which is NOT
   * "required": a nullable argument cannot be made required in the SDL, so omitting
   * the key is legal GraphQL that the RESOLVER's own guard (`interactions.py`) then
   * refuses. `null` is a real, distinct request ("reorder the roots"), so the two
   * must not collapse. An `undefined` member here would type-check, and with
   * `strict`/`strictNullChecks` OFF nothing would stop a caller writing `{ linkIds }`
   * and shipping a variables object with no `parentId` key at all. Making that
   * spelling unrepresentable in our own code is the entire job of this annotation —
   * the same discipline `collapseThreads?: boolean` uses on
   * PublicSocialMediaLinksVars for the mirror-image mistake.
   */
  parentId: string | null;
}

/**
 * Detach the given links from their parents — `ok` only, with **no `id`**.
 *
 * ⚠️ The behaviour is asymmetric and BOTH halves are correct; this is not a bug
 * to be "fixed" into a cascade or a re-root election:
 *
 *   - Ungrouping a **ROOT** (`parentId == null` already) leaves its subtree
 *     attached. The root was never a child of anything, so there is nothing to
 *     detach — the conversation survives as root + children, with one fewer id
 *     pointing at it than before only in the sense that the id you sent was
 *     already inert.
 *   - Ungrouping **CHILDREN** sets `parent = null` on each one, promoting each to
 *     a root of its own. Done one at a time this dissolves the tree from the
 *     bottom up, which is the intended path. ⚠️ A promoted node KEEPS its own
 *     children, so promoting a middle node promotes a whole subtree; the server
 *     deliberately does not flatten it, so a client must not assume the
 *     descendants came along.
 *
 * So there is no cascade (ungroup a root and its children stay put) and no re-root
 * election (ungroup every child and no new root is promoted). Do not add either to
 * the UI: re-pointing descendants onto a promoted node would have to happen
 * server-side, and the server deliberately leaves the user's intent legible.
 *
 * The related server-side asymmetry, for a reader wondering why the `parent` FK is
 * `SET_NULL`: deleting a link promotes its children to roots rather than cascading
 * them away, which is why "ungroup" and "delete" are different verbs here.
 *
 * Same call shape as `GROUP_SOCIAL_MEDIA_LINKS_MUTATION`, same required
 * `firebase-auth-key` header:
 *
 * ```ts
 * const idToken = await this.auth.idToken();
 * await this.graphql.request<UngroupSocialMediaLinksData, UngroupSocialMediaLinksVars>(
 *   UNGROUP_SOCIAL_MEDIA_LINKS_MUTATION,
 *   { linkIds: [...selected].filter(Boolean) },
 *   idToken ? { "firebase-auth-key": idToken } : {},
 * );
 * ```
 */
export const UNGROUP_SOCIAL_MEDIA_LINKS_MUTATION = /* GraphQL */ `
  mutation UngroupSocialMediaLinks($linkIds: [ID!]!) {
    ungroupSocialMediaLinks(linkIds: $linkIds) {
      ok
    }
  }
`;

export interface UngroupSocialMediaLinksData {
  /** `id` is absent from this selection on purpose: `ungroup` names back no row. */
  ungroupSocialMediaLinks: { ok: boolean };
}

export interface UngroupSocialMediaLinksVars {
  /** Same `[ID!]!` constraints as `GroupSocialMediaLinksVars.linkIds` — non-null
   *  elements (filter empties) and no repeats (the backend rejects duplicates). */
  linkIds: string[];
}
