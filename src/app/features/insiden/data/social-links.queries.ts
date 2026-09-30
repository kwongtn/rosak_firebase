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
 * NOTE the deliberate looseness of this type: it is ALSO the node type of the
 * nested `links(first: 10)` sub-select in INSIDEN_INCIDENTS_QUERY, which selects
 * only `id url title occurredAt created status completed` — narrower than this
 * query on purpose. That is why every additive field is OPTIONAL here even where
 * the public query selects it: a narrower host selection must still satisfy the
 * type. The thread fields are what a future grouping surface needs.
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
  /** Id of the thread root this link belongs to; `null` exactly when this link IS a
   * root (which includes every ordinary unthreaded link). */
  threadId?: string | null;
  /** True for thread roots — the host's "render me as a root" signal. */
  isThreadRoot?: boolean;
  /** `1 + count(publicly-visible members)` — the "N links" badge number; `1` when
   * unthreaded. Only publicly-visible members count, so the badge can never
   * advertise a link that resolves into moderation. */
  threadSize?: number;
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
 * graphqlResource). `collapseThreads` swaps the flat member list for thread roots
 * and is only ever set by the home feed; see PublicSocialMediaLinksVars for the
 * null-vs-omit trap its `Boolean!` argument type makes load-bearing.
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
          # Thread grouping. threadSize counts only publicly-visible members, so
          # the badge cannot advertise a hidden link. threadLinks is NOT selected
          # here on purpose: this query hosts flat lists (situasi tab, per-incident
          # sections, My Links), and collapseThreads is only ever flipped on by the
          # home feed, whose own document (FEED_QUERY) carries the nested members.
          threadId
          isThreadRoot
          threadSize
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
   * Collapse each thread to its root row (the members arrive through the host's
   * own nested `threadLinks` selection — FEED_QUERY's, since that is the only
   * surface that collapses). Deliberately NOT defaulted in the document and NOT
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

/* ---- Thread grouping --------------------------------------------------- *
 * `groupSocialMediaLinks` / `ungroupSocialMediaLinks` are dedicated id-only
 * mutations rather than another mode of `updateSocialMediaLink`, and that is
 * load-bearing: `SocialMediaLinkInput` is REPLACE-NOT-PATCH (see
 * UpdateSocialMediaLinkVars above), so routing a grouping action through it
 * would blank `title` and strip all four M2M tag sets as a side effect. These
 * two send ids only and touch nothing else on the row.
 *
 * Backend: rosak_backend incident/schema/mutations/interactions.py →
 * incident/services/social_link_threads.py. The whole call is one
 * `transaction.atomic()` and is ALL-OR-NOTHING — if any id fails the
 * ownership/admin gate the entire selection is rejected, so a client never has
 * to render (or recover from) a partial group. Permission is admin-on-anything
 * or submitter-on-own-links, and an append must target a thread the caller
 * owns.
 */

/**
 * Group selected links into one thread; omit `threadId` to start a NEW one.
 *
 * `id` is the **thread ROOT's** id — for both modes — which is what lets a
 * caller refetch exactly one thread afterwards instead of guessing which of
 * the rows it just sent is now the representative. The two modes:
 *
 *   - **No `threadId`** (or an explicit `null`) → start a new thread. The root
 *     is the selected link with the earliest `(occurredAt, id)` — earliest
 *     *event*, not earliest submission, because the root is the row the card
 *     renders and a thread has to read as a timeline. Any selected link that
 *     was itself a root with members has those members FLATTENED onto the new
 *     root (the model invariant is "`thread` always points at a ROOT", so
 *     merging two live threads without re-pointing would leave members dangling
 *     off a row that is no longer a root).
 *   - **With a `threadId`** → APPEND to that thread. The target is resolved and
 *     followed up to its real root first, so passing a link that is itself a
 *     member still lands the selection on the root instead of deepening the
 *     graph to depth 2.
 *
 * `threadId` is `ID = null`: explicitly nullable WITH a default, so both
 * omitting the key and sending `null` mean "start a new thread". ⚠️ Do not
 * conflate that with `collapseThreads: Boolean!` on
 * `PUBLIC_SOCIAL_MEDIA_LINKS_QUERY`, where an explicit `null` is a hard
 * operation error ("Argument 'collapseThreads' of non-null type 'Boolean!' must
 * not be null") — same-looking optional argument, opposite null semantics, and
 * the type of each Vars interface has to keep the distinction visible.
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
 *     ...(targetThreadId ? { threadId: targetThreadId } : {}), // omit to start a new thread
 *   },
 *   idToken ? { "firebase-auth-key": idToken } : {},
 * );
 * // data.groupSocialMediaLinks.id -> refetch this ONE thread. It is an Int.
 * ```
 */
export const GROUP_SOCIAL_MEDIA_LINKS_MUTATION = /* GraphQL */ `
  mutation GroupSocialMediaLinks($linkIds: [ID!]!, $threadId: ID) {
    groupSocialMediaLinks(linkIds: $linkIds, threadId: $threadId) {
      ok
      id
    }
  }
`;

export interface GroupSocialMediaLinksData {
  groupSocialMediaLinks: {
    ok: boolean;
    /**
     * The thread root's id, so the caller can refetch exactly one thread.
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
   * Omit the key (or send `null`) to START a new thread; send a root id to
   * APPEND to that thread. Typed `string | null | undefined` because the
   * backend argument is `ID = null` — unlike `collapseThreads: Boolean!` on
   * PublicSocialMediaLinksVars, where `null` is fatal. See the mutation's
   * doc comment before spelling one the other way.
   */
  threadId?: string | null;
}

/**
 * Detach the given links from their threads — `ok` only, with **no `id`**.
 *
 * ⚠️ The behaviour is asymmetric and BOTH halves are correct; this is not a bug
 * to be "fixed" into a cascade or a re-root election:
 *
 *   - Ungrouping a **ROOT** (`threadId == null` already) leaves its members
 *     attached. The root was never a member of anything, so there is nothing to
 *     detach — the thread survives as root + members, with one fewer id
 *     pointing at it than before only in the sense that the id you sent was
 *     already inert.
 *   - Ungrouping **MEMBERS** sets `thread = null` on each one. Done one at a
 *     time this eventually leaves the original root a singleton — which is the
 *     intended "dissolve the thread" path.
 *
 * So there is no cascade (ungroup a root and its members stay grouped) and no
 * re-root election (ungroup every member and no new root is promoted). Do not
 * add either to the UI: re-pointing members onto a promoted root would have to
 * happen server-side, and the server deliberately leaves the user's intent
 * legible.
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
