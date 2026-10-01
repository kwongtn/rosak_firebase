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
 * The `occurredAt` + tree fields below follow the same optionality rule, with one hard
 * constraint: `created` stays REQUIRED, because it is the card's fallback display instant
 * (`occurredAt ?? created`) and the tooltip's absolute timestamp. A node that selects
 * `occurredAt` but omits `created` would render a blank time, so every document that selects
 * the tree fields must keep selecting `created` alongside them — including the nested
 * `sublinks` sub-selections in `FEED_QUERY`, whose children are themselves rendered as cards.
 *
 * ⚠️ `sublinks` is RECURSIVE and its element type is this very interface, which is what turns
 * "the nested selection must carry every field the card reads" into a type-level requirement
 * instead of a review comment: a level-N child is itself a `LinkCardItem`, so a host that
 * forgets `voteBreakdown` on the third level down fails to satisfy the very same contract the
 * root does. Nothing about the recursion needs an annotation — the original
 * self-reference was already an interface, and an interface body may name itself.
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

  /* ---- Conversation tree (self-referencing `parent` FK, stored depth 0..3) --
   * A link is either a ROOT (nothing points at it) or a sublink whose `parentId`
   * is some other link, and a sublink can have sublinks of its own — the shape is
   * a TREE, not the depth-1 root-plus-members pair the previous flat grouping
   * design described. The server caps the WRITE side at `MAX_THREAD_DEPTH = 3`
   * (rosak_backend `incident/services/social_link_threads.py`), so real data has
   * four stored levels: root -> sublink -> sub-sub-link -> leaf. Nothing on this
   * side may assume that cap: a deeper selection is legal and simply comes back
   * `[]`, so the recursion below is open-ended and every level's affordance test
   * is `sublinkCount > 0`, which is false for a leaf.
   *
   * Visibility rule that couples a whole tree: a conversation is public iff its
   * ROOT is, and the time windows resolve across the entire subtree. So
   * `sublinkCount`/`sublinks` count and list only publicly-visible descendants —
   * a badge must never advertise a link that resolves into moderation, and a
   * hidden sublink is not listed even on your OWN `mine` page. The asymmetry
   * that survives is moderation, which is root-only: hiding a middle node leaves
   * it attached to the tree but takes it (and its own descendants) out of both
   * the count and the list.
   */

  /** Id of the link this one hangs under; `null` exactly when this link IS a root (which also
   *  covers every ordinary ungrouped link — a lone link is a tree of one). Backend
   *  `SocialMediaLinkScalar.parentId: ID`, NULLABLE with no default meaning other than "root". */
  parentId?: string | null;

  /** True for roots — including plain ungrouped links, since `parentId == null` IS the definition
   *  of a root. 🔴 This is a ROOT MARKER, not a "has sublinks" marker: it is `true` for every
   *  unthreaded link in the app, so gating an expand affordance on it would put a "1 links" chip
   *  on every ordinary row. The ONLY correct affordance test is `sublinkCount > 0`, or
   *  `sublinks.length > 0` where the host selects the list. A host is still free to use it for
   *  what it actually means — "render me as the head of a tree" (the previous use: the host's
   *  "do I indent this row" question). Backend `SocialMediaLinkScalar.isThreadRoot: Boolean!`,
   *  which is exactly `parentId == null`. */
  isThreadRoot?: boolean;

  /**
   * This node's OWN publicly-visible descendant count, at ANY depth — `0` for a leaf.
   *
   * 🔴 It is NOT the size of the conversation. Read the ROOT's count to size a
   * conversation; a middle node answers only for what hangs below itself. Summing
   * the counts level by level double-counts by exactly the depth (root 2, child 1,
   * leaf 0 sums to 3 for a 3-link tree), which is precisely the shape the
   * depth-1 design could not produce — there, a member could not have
   * children, so "ask every node" happened to return the size once per level and
   * nobody summed them. Here every node answers for itself and the recursion
   * terminates on `0`.
   *
   * Publicly-visible only, so it can never advertise a link that resolves into moderation. This is
   * the number a "N links" chip shows, and because it is derived from the SAME server loader
   * call as `sublinks` it is structurally incapable of disagreeing with the list it labels.
   * Backend `SocialMediaLinkScalar.sublinkCount: Int!`.
   */
  sublinkCount?: number;

  /**
   * This node's DIRECT children, ordered by the stored sibling `position` — **not** by
   * `occurredAt` and **not** by `id`, unlike every other link list in the app (those all order
   * `occurredAt DESC, id DESC`). A group is a conversation with an author-chosen order, not a
   * timeline, and its members need not even be contiguous in time. `[]` for a leaf, which is
   * the overwhelmingly common case.
   *
   * Typed as `LinkCardItem[]` because every child is rendered by the same card, so a host can
   * hand one straight to `app-link-card` with no mapping. The recursive reference is
   * deliberate — see the interface docstring.
   *
   * OPTIONAL, and absent from the deliberately FLAT surfaces' documents: `/insiden` and the
   * situasi tab show every link as its own row and have no expansion to reveal, so selecting
   * `sublinks` there would only invite a "3 links" chip pointing at nothing.
   * Backend `SocialMediaLinkScalar.sublinks: [SocialMediaLinkScalar!]!`.
   */
  sublinks?: LinkCardItem[];

  /* ---- The EDIT ROUND-TRIP tag relations ------------------------------------ *
   * The vehicle / station / calendar-incident-category rows this link is tagged
   * with. The card renders NONE of them, and no `app-link-card` input reads them.
   *
   * 🔴 They are in this contract for a reason that has nothing to do with display, and
   * that reason is why they are OPTIONAL rather than required. They exist so that a
   * host which opens a row in the shared edit sheet can hand it the tags the row
   * already has. `SocialMediaLinkInput` is REPLACE-NOT-PATCH: the update service
   * assigns the title and calls `.set()` on lines / vehicles / stations / categories
   * unconditionally, so a payload that omits a relation does not leave it alone — it
   * BLANKS it. The form sends the complete editable set and hydrates these three
   * lists from the link being edited, so a host whose query did not select them
   * hydrates empty selections and the next save silently deletes the row's real tags.
   *
   * A surface with no edit affordance simply does not need them, which is why they are
   * optional: a fixture or a read-only card can omit them without breaking the
   * contract. But a host that DOES have an edit path and does not select them has a
   * data-loss bug, not a payload saving — so the documents that feed such a host
   * (`FEED_QUERY`, `PUBLIC_SOCIAL_MEDIA_LINKS_QUERY`, the console's own links query)
   * all select the same minimal identifying pairs, and `home.queries.spec.ts` pins
   * that `FEED_QUERY` keeps doing so at every nesting level.
   *
   * Element shapes are the MINIMUM that identifies the row, so a document may narrow
   * them further (dropping `identificationNo`) and still satisfy this contract.
   * Backend: `SocialMediaLinkScalar.vehicles: [Vehicle!]!`, `stations: [Station!]!`,
   * `categories: [CalendarIncidentCategoryScalar!]!`.
   */
  vehicles?: Array<{ id: string }>;
  stations?: Array<{ id: string }>;
  categories?: Array<{ id: string; name: string }>;
}
