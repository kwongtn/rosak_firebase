/**
 * GraphQL documents + hand-written types for the community front page (Wave 4 data layer).
 * Field names are copied verbatim from the deployed Strawberry schema — the backend is the
 * source of truth. No codegen, no `gql` tag: mirrors the conventions in
 * features/insiden/data/social-links.queries.ts and features/spotting/data/spotting.queries.ts.
 */

// Type-only, so it is erased at compile time and closes no module loop.
import type { VoteAcknowledgement } from "../../insiden/vote-button/vote-state.util";

/* ---------------------------------------------------------------------- *
 * Enums (mirrored from the schema)
 * ---------------------------------------------------------------------- */

export type LineStatus =
  "TESTING" | "DEFUNCT" | "ACTIVE" | "PARTIAL_ACTIVE" | "PARTIAL_DISRUPTION" | "TOTAL_DISRUPTION";

export type PassengerStatus =
  "NORMAL" | "BUSY" | "CROWDED" | "EXTREMELY_CROWDED" | "BACKLOGGED" | "DELAYED" | "DISRUPTED";

/** `HIDDEN` is the backend's moderation state (rosak_backend `SocialMediaLinkStatus.HIDDEN`):
 * the row exists and admins still see it in the console so they can un-hide it, but the public
 * feed never returns it — not even through an explicit `status: HIDDEN` narrowing. */
export type SocialMediaLinkStatus = "LIVE" | "PENDING_APPROVAL" | "HIDDEN";

export type VehicleStatus =
  | "IN_SERVICE"
  | "NOT_SPOTTED"
  | "OUT_OF_SERVICE"
  | "DECOMMISSIONED"
  | "MARRIED"
  | "TESTING"
  | "UNKNOWN";

/* ---------------------------------------------------------------------- *
 * lines — the front page's line pulse list (plain list, no pagination)
 * ---------------------------------------------------------------------- */

export const FRONT_PAGE_LINES_QUERY = /* GraphQL */ `
  query FrontPageLines {
    lines {
      id
      code
      displayName
      displayColor
      status
      inServiceVehicleCount
      totalVehicleCount
      passengerStatus
      passengerStatusMessage
      statusReportCount
      vehicleStatusCounts {
        status
        count
      }
      passengerStatusCount
      passengerStatusCounts {
        status
        count
      }
      statusWindowMinutes
      pulseLinks {
        id
        url
        normalizedUrl
        title
        created
        occurredAt
        # The provenance flag: true for a post the OFFICIAL-post ingestion wrote, false for every
        # hand-submitted link. The board's confidence chip and the hero's official callout both
        # read it, so a line the operator has announced itself never reads as merely "confirmed by
        # riders". The field already exists on SocialMediaLinkScalar server-side — selecting it here
        # is additive and costs no new request.
        isAutomated
        voteScore
        userVote
        voteBreakdown {
          upvotes
          downvotes
        }
        lines {
          id
          code
        }
        user {
          shortId
          nickname
        }
      }
    }
  }
`;

export interface FrontPageLinesQueryData {
  lines: LinePulse[];
}

/** A pulse link nested under a line — the subset of SocialMediaLinkScalar the front page reads.
 * Only `occurredAt` is added on this surface: a line pulse is a compact widget that shows one
 * timestamp.
 *
 * 🔴 It is DELIBERATELY FLAT, and the conversation tree does NOT follow it in, even though the
 * previous wave added `occurredAt` here and a reader will reasonably wonder whether the tree
 * should too. Three reasons, all of which would have to be un-done otherwise:
 *   - the widget renders ONE link row per report with a fixed, single-line budget; there is no
 *     room for an indent gutter, an expand affordance, or a nested list;
 *   - it is a LINE's report, not a conversation: a member of someone else's thread is still a
 *     report about that line, and collapsing the widget by tree would hide reports the line
 *     actually received;
 *   - `parentId`/`isThreadRoot`/`sublinkCount`/`sublinks` are all OPTIONAL on the structural
 *     `LinkCardItem`, so a flat node satisfies the card contract unchanged. Selecting them here
 *     would add four fields per report across every line on the page and change nothing on screen.
 * The link list the pulse reads is the same `occurredAt DESC, id DESC` ordering as every other
 * list — never the sibling `position` order that `sublinks` uses. */
interface LinePulseLink {
  id: string;
  url: string;
  normalizedUrl: string | null;
  title: string;
  created: string;
  /** The instant the linked event happened (NOT NULL on the backend) — what a pulse shows in
   * place of `created`, which is only "when someone reported it". Naive local wall time, no
   * offset (backend `USE_TZ = False`); never re-format through UTC. */
  occurredAt: string;
  /** True for a post the official-post ingestion wrote (backend `is_automated`). Drives the board's
   * `status-confidence.official` reading and the hero's official-update callout — the ONLY thing
   * that separates "the operator said so" from "N riders think so", so it is read as `=== true` and
   * never as truthiness. */
  isAutomated: boolean;
  voteScore: number;
  userVote: number;
  voteBreakdown: { upvotes: number; downvotes: number };
  lines: Array<{ id: string; code: string }>;
  user: { shortId: string; nickname: string } | null;
}

/** The selected `Line` shape for the front page. `passengerStatus` is nullable ⇒ "No data". */
export interface LinePulse {
  id: string;
  code: string;
  displayName: string;
  displayColor: string;
  status: LineStatus;
  inServiceVehicleCount: number;
  totalVehicleCount: number;
  passengerStatus: PassengerStatus | null;
  passengerStatusMessage: string | null;
  statusReportCount: number;
  vehicleStatusCounts: Array<{ status: VehicleStatus; count: number }>;
  passengerStatusCount: number;
  passengerStatusCounts?: Array<{ status: PassengerStatus; count: number }>;
  statusWindowMinutes: number;
  pulseLinks: LinePulseLink[];
}

/* ---------------------------------------------------------------------- *
 * publicSocialMediaLinks — the public feed (keyset paginated)
 * ---------------------------------------------------------------------- */

export const FEED_QUERY = /* GraphQL */ `
  query Feed(
    $first: Int!
    $after: String
    $status: SocialMediaLinkStatus
    $currentServiceDayOnly: Boolean
    $lastWeekOnly: Boolean
    $alignPageToDay: Boolean
    $collapseThreads: Boolean
    # Narrow the connection to links tagged with one line. NULLABLE, and every read OMITS the key
    # when no line is selected: "no filter" is the ABSENCE of the argument, never an explicit null,
    # so the unfiltered reads keep byte-identical variables server-side and client-side (the SSR
    # TransferState requirement) and a null can never be mistaken for "filter to nothing".
    $lineId: ID
  ) {
    publicSocialMediaLinks(
      first: $first
      after: $after
      status: $status
      currentServiceDayOnly: $currentServiceDayOnly
      lastWeekOnly: $lastWeekOnly
      alignPageToDay: $alignPageToDay
      collapseThreads: $collapseThreads
      lineId: $lineId
    ) {
      edges {
        node {
          id
          url
          normalizedUrl
          title
          created
          # When the linked event HAPPENED, as opposed to created above ("when
          # someone reported it"). NOT NULL on the backend and the leading key
          # of this feed's -occurredAt, -id ordering, so it is what every day
          # group, relative label and "Occurred" column must read. Naive local
          # wall time (backend USE_TZ = False) — never re-format via UTC.
          occurredAt
          # Conversation tree. parentId/isThreadRoot/sublinkCount let the feed
          # wrapper decide what to draw; sublinks carries the children so expanding
          # a conversation needs no second request. All FOUR are required on the
          # FeedLink type because this document selects all four — and unlike the
          # removed grouping fields there is no alias on the server, so a stale
          # spelling here is a hard "Unknown field" on the whole query.
          parentId
          isThreadRoot
          sublinkCount
          # Sublinks = DIRECT children only, ordered by the stored sibling
          # position (NOT occurredAt, NOT id — every other link list in this app
          # orders occurredAt DESC, id DESC). Recursive: each level below selects
          # its own sublinks, and a level that the server stores nothing under comes
          # back [] rather than erroring.
          #
          # NESTING DEPTH = FOUR sublinks blocks, i.e. root -> L1 -> L2 -> L3 ->
          # L4. The server caps the WRITE side at MAX_THREAD_DEPTH = 3 with a root
          # at depth 0, so the deepest STORED node is L3 and the L4 block is
          # guaranteed to answer []. It is kept on purpose: the extra level costs
          # one [] per node on a brand-new link, and it means raising the cap
          # later needs no document change. The depth is written out in full so a
          # reader can check it against the server constant rather than count
          # braces.
          #
          # Every level selects what the card renders for a CHILD: the same fields
          # the root node selects minus normalizedUrl (nothing renders it — see
          # FeedLinkSublink), and that includes the three scalar tree fields. The
          # tree scalars are NOT optional-at-depth: a child that has children of its
          # own is itself the head of a nested conversation, and the in-card
          # affordance reads sublinkCount, so a level that omitted it could not be
          # expanded and a 3-level conversation would render 2. created is selected
          # at every level even though it is not displayed, because LinkCardItem
          # REQUIRES it (the card's fallback is occurredAt ?? created and a child
          # without it renders a blank time). completed is here for symmetry with
          # the root, not because the card reads it.
          sublinks {
            id
            url
            title
            created
            occurredAt
            parentId
            isThreadRoot
            sublinkCount
            status
            completed
            isAutomated
            voteScore
            userVote
            voteBreakdown {
              upvotes
              downvotes
            }
            lines {
              id
              code
              displayName
            }
            # Edit round-trip tags — NOT rendered by the card, and selected ONLY so
            # this row can hand its own tags back to the edit sheet. SocialMediaLinkInput
            # is replace-not-patch, so a payload that omits a relation does not leave it
            # alone, it BLANKS it — see the FeedLink doc comment. Minimal identifying pairs
            # on purpose: the Vehicle scalar also carries vehicleType, incidents,
            # spottings and spottingTrends(...), so selecting all of it would multiply
            # payload and resolver fan-out on every row of every feed page.
            vehicles {
              id
              identificationNo
            }
            stations {
              id
              displayName
            }
            categories {
              id
              name
            }
            user {
              shortId
              nickname
            }
            sublinks {
              id
              url
              title
              created
              occurredAt
              parentId
              isThreadRoot
              sublinkCount
              status
              completed
              isAutomated
              voteScore
              userVote
              voteBreakdown {
                upvotes
                downvotes
              }
              lines {
                id
                code
                displayName
              }
              # Edit round-trip tags — NOT rendered by the card, and selected ONLY so
              # this row can hand its own tags back to the edit sheet. SocialMediaLinkInput
              # is replace-not-patch, so a payload that omits a relation does not leave it
              # alone, it BLANKS it — see the FeedLink doc comment. Minimal identifying pairs
              # on purpose: the Vehicle scalar also carries vehicleType, incidents,
              # spottings and spottingTrends(...), so selecting all of it would multiply
              # payload and resolver fan-out on every row of every feed page.
              vehicles {
                id
                identificationNo
              }
              stations {
                id
                displayName
              }
              categories {
                id
                name
              }
              user {
                shortId
                nickname
              }
              sublinks {
                id
                url
                title
                created
                occurredAt
                parentId
                isThreadRoot
                sublinkCount
                status
                completed
                isAutomated
                voteScore
                userVote
                voteBreakdown {
                  upvotes
                  downvotes
                }
                lines {
                  id
                  code
                  displayName
                }
                # Edit round-trip tags — NOT rendered by the card, and selected ONLY so
                # this row can hand its own tags back to the edit sheet. SocialMediaLinkInput
                # is replace-not-patch, so a payload that omits a relation does not leave it
                # alone, it BLANKS it — see the FeedLink doc comment. Minimal identifying pairs
                # on purpose: the Vehicle scalar also carries vehicleType, incidents,
                # spottings and spottingTrends(...), so selecting all of it would multiply
                # payload and resolver fan-out on every row of every feed page.
                vehicles {
                  id
                  identificationNo
                }
                stations {
                  id
                  displayName
                }
                categories {
                  id
                  name
                }
                user {
                  shortId
                  nickname
                }
                sublinks {
                  id
                  url
                  title
                  created
                  occurredAt
                  parentId
                  isThreadRoot
                  sublinkCount
                  status
                  completed
                  isAutomated
                  voteScore
                  userVote
                  voteBreakdown {
                    upvotes
                    downvotes
                  }
                  lines {
                    id
                    code
                    displayName
                  }
                  # Edit round-trip tags — NOT rendered by the card, and selected ONLY so
                  # this row can hand its own tags back to the edit sheet. SocialMediaLinkInput
                  # is replace-not-patch, so a payload that omits a relation does not leave it
                  # alone, it BLANKS it — see the FeedLink doc comment. Minimal identifying pairs
                  # on purpose: the Vehicle scalar also carries vehicleType, incidents,
                  # spottings and spottingTrends(...), so selecting all of it would multiply
                  # payload and resolver fan-out on every row of every feed page.
                  vehicles {
                    id
                    identificationNo
                  }
                  stations {
                    id
                    displayName
                  }
                  categories {
                    id
                    name
                  }
                  user {
                    shortId
                    nickname
                  }
                }
              }
            }
          }
          status
          completed
          isAutomated
          voteScore
          userVote
          voteBreakdown {
            upvotes
            downvotes
          }
          lines {
            id
            code
            displayName
          }
          # Edit round-trip tags — NOT rendered by the card, and selected ONLY so
          # this row can hand its own tags back to the edit sheet. SocialMediaLinkInput
          # is replace-not-patch, so a payload that omits a relation does not leave it
          # alone, it BLANKS it — see the FeedLink doc comment. Minimal identifying pairs
          # on purpose: the Vehicle scalar also carries vehicleType, incidents,
          # spottings and spottingTrends(...), so selecting all of it would multiply
          # payload and resolver fan-out on every row of every feed page.
          vehicles {
            id
            identificationNo
          }
          stations {
            id
            displayName
          }
          categories {
            id
            name
          }
          user {
            shortId
            nickname
          }
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
      totalCount
    }
  }
`;

export interface FeedQueryVars {
  first: number;
  after?: string | null;
  status?: SocialMediaLinkStatus | null;
  currentServiceDayOnly?: boolean | null;
  /** Window filter for the home page's collapsed "Last Week" section: keep only links whose
   * event instant (`occurredAt`) is since 00:00 (Asia/Kuala_Lumpur) six days before today.
   * Computed backend-side so the frontend never bakes a date into query variables (SSR
   * TransferState needs identical vars). Keys on `occurredAt`, NOT `created` — the ordering is
   * `-occurredAt, -id`, and windowing one column while sorting another would drop a backdated
   * report into a day it does not belong to.
   *
   * TODAY IS EXCLUDED, by the backend default rather than by an argument this side sends: the
   * resolver's `display_today_in_last_week` defaults to `false`, so the window is closed at 00:00
   * today and the newest day group the section can show is "Yesterday". This side deliberately does
   * NOT send the flag — relying on the default keeps a frontend that deploys BEFORE the backend
   * change correct, instead of asking for a variable an older schema rejects. */
  lastWeekOnly?: boolean | null;
  /** When true, a returned page never ends mid-calendar-day: the backend may exceed `first` to
   * finish the current day. Used by the last-week section's Load More so day groups stay whole. */
  alignPageToDay?: boolean | null;
  /**
   * Collapse each thread to its root row. Deliberately NOT defaulted in the document and NOT
   * nullable here, because the backend argument is `collapseThreads: Boolean! = false` — a
   * NON-NULL type.
   *
   * ⚠️ Verified against the deployed schema: omitting the key entirely is fine (Strawberry
   * applies the `false` default), but sending an explicit `collapseThreads: null` fails the
   * whole operation with "Argument 'collapseThreads' of non-null type 'Boolean!' must not be
   * null". Hence `boolean | undefined`, not `boolean | null` — the type has to make the fatal
   * spelling unrepresentable. (The three window flags above are equally non-null on the backend
   * and already carry this exposure; they predate this wave and are left alone.)
   *
   * The nested `sublinks` selection above is what makes collapsing useful: only the root
   * row appears in `edges`, and its whole subtree arrives inline. Ignored server-side when
   * `mine` is set — this query never sends `mine`.
   */
  collapseThreads?: boolean;
  /** Narrow the connection to links tagged with ONE line id, for the feed's line filter.
   *
   * 🔴 `string | undefined`, NEVER `string | null`, and every call site OMITS the key when no line
   * is selected rather than sending `null`. Two reasons, and the second is the load-bearing one:
   *  - the backend's own read is `lineId: ID` (nullable), so `null` would answer the same rows as
   *    the argument being absent — but the two are DIFFERENT variable objects, and the vote-overlay
   *    reads deliberately never send it while the resources do, so "omitted" has to stay an
   *    unambiguous, ownable state rather than one of two spellings of the same query;
   *  - the variable object has to be STRUCTURALLY IDENTICAL on the server and on the client or the
   *    SSR TransferState payload is not reused and every feed read fires twice. A key that is
   *    conditionally spread in is one value that is conditionally present, which is exactly that.
   *
   * A per-line `$lineId` narrows the RENDERED rows, so it must NOT be added to the authenticated
   * vote-overlay reads: those deliberately stay unfiltered (a wider read is harmless — an unused id
   * costs nothing — while a narrower one loses votes). `home.store.spec.ts` pins that asymmetry as
   * "the overlay variables equal the resource variables minus `lineId`, and `lineId` is the only
   * key the overlay may omit". */
  lineId?: string;
}

export interface FeedQueryData {
  publicSocialMediaLinks: FeedLinkConnection;
}

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

interface FeedLinkConnection {
  edges: FeedLinkEdge[];
  pageInfo: FeedLinkPageInfo;
  totalCount: number;
}

/* ---------------------------------------------------------------------- *
 * lineStatusHistory — hourly report buckets for one line
 * ---------------------------------------------------------------------- */

export const LINE_STATUS_HISTORY_QUERY = /* GraphQL */ `
  query LineStatusHistory($lineId: ID!, $dayStartHour: Int) {
    lineStatusHistory(lineId: $lineId, dayStartHour: $dayStartHour) {
      hourStart
      hourEnd
      count
      dominantStatus
      statusCounts {
        status
        count
      }
    }
  }
`;

export interface LineStatusHistoryQueryVars {
  lineId: string;
  dayStartHour?: number | null;
}

export interface LineStatusHistoryQueryData {
  lineStatusHistory: LineStatusHourBucket[];
}

/** One hourly bucket of community reports. `dominantStatus` is null for an empty hour. */
export interface LineStatusHourBucket {
  hourStart: string;
  hourEnd: string;
  count: number;
  dominantStatus: PassengerStatus | null;
  /** The hour's per-status tallies in `PassengerStatus` declaration order, zero counts omitted
   * (an empty hour returns `[]`). Always sums to `count`. */
  statusCounts: Array<{ status: PassengerStatus; count: number }>;
}

/* ---------------------------------------------------------------------- *
 * networkStatusHistory / linesStatusHistory — the SERVICE-DAY hour buckets
 *
 * Three documents share one `LineStatusHourBucket` selection and one shape, and they differ only
 * in scope: `lineStatusHistory` (above) is ONE line, `networkStatusHistory` is every line combined
 * into one hour-by-hour tally, and `linesStatusHistory` is up to 64 lines answered in ONE request
 * (so every board row's report label and the heat grid are fed by one per-line read instead of
 * sixteen).
 *
 * 🔴 `networkStatusHistory` is a NETWORK AGGREGATE, not a per-line series: an hour's `count`,
 * `dominantStatus` and `statusCounts` tally EVERY line's reports in that hour. Drawing it under one
 * line's name would silently attribute other lines' reports to it — which is why the hero's
 * sparkline is labelled a NETWORK read and the per-line readings behind the board rows and the heat
 * grid come from `linesStatusHistory` instead.
 * ---------------------------------------------------------------------- */

/**
 * `dayStartHour` is DECLARED AND PASSED but deliberately OMITTED from every variables object this
 * side builds, so the backend's own default (3 — the community service day runs 03:00 → 02:00)
 * applies.
 *
 * The document has to declare it: a GraphQL variable declared and never used is a validation error,
 * so the alternative is a variable nobody can set. The call sites then send `{}` / `{ lineIds }`,
 * which is the same rule the last-week window follows (`lastWeekOnly` is computed backend-side for
 * exactly this reason) — a `new Date()` or a client clock baked into query variables would make the
 * server render and the client hydration compute different variables, and `retainDataIfEqual` /
 * TransferState would then refetch instead of reusing the server payload.
 */
export const NETWORK_STATUS_HISTORY_QUERY = /* GraphQL */ `
  query NetworkStatusHistory($dayStartHour: Int) {
    networkStatusHistory(dayStartHour: $dayStartHour) {
      hourStart
      hourEnd
      count
      dominantStatus
      statusCounts {
        status
        count
      }
    }
  }
`;

export interface NetworkStatusHistoryQueryVars {
  /** Deliberately never sent — see the document's own note. `number | null`, never a date. */
  dayStartHour?: number | null;
}

export interface NetworkStatusHistoryQueryData {
  networkStatusHistory: LineStatusHourBucket[];
}

/**
 * Every line's reports for the current service day in ONE request, keyed back to the line id.
 *
 * The id list is sent SORTED, never in board order and never in the order the server would return:
 * the variables object is compared structurally between the server render and the client hydration
 * (SSR TransferState reuse), and a list whose order follows a reactive view would reorder whenever
 * the board's sort changed — re-firing a read that asked for exactly the same lines. 64 ids is the
 * backend cap, above which it answers with a typed GraphQL error rather than a silent truncation.
 */
export const LINES_STATUS_HISTORY_QUERY = /* GraphQL */ `
  query LinesStatusHistory($lineIds: [ID!]!) {
    linesStatusHistory(lineIds: $lineIds) {
      lineId
      buckets {
        hourStart
        hourEnd
        count
        dominantStatus
        statusCounts {
          status
          count
        }
      }
    }
  }
`;

export interface LinesStatusHistoryQueryVars {
  lineIds: string[];
  /** Deliberately never sent — see `NETWORK_STATUS_HISTORY_QUERY`. */
  dayStartHour?: number | null;
}

export interface LinesStatusHistoryQueryData {
  linesStatusHistory: LineStatusHistory[];
}

/** One line's hourly buckets. `buckets: []` is this line's "nothing reported this service day" —
 *  the absence of data, NOT an error and never a reason to zero-fill the widget. */
export interface LineStatusHistory {
  lineId: string;
  buckets: LineStatusHourBucket[];
}

/* ---------------------------------------------------------------------- *
 * lineStatusReports — the per-line report list (keyset paginated)
 * ---------------------------------------------------------------------- */

export const LINE_STATUS_REPORTS_QUERY = /* GraphQL */ `
  query LineStatusReports($lineId: ID!, $first: Int!, $after: String) {
    lineStatusReports(lineId: $lineId, first: $first, after: $after) {
      edges {
        node {
          id
          status
          delayMinutes
          notes
          created
          stations {
            id
            displayName
          }
          user {
            shortId
            nickname
          }
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

export interface LineStatusReportsQueryVars {
  lineId: string;
  first: number;
  after?: string | null;
}

export interface LineStatusReportsQueryData {
  lineStatusReports: LineStatusReportConnection;
}

/** One community status report — the selected LineStatusReportScalar subset. */
export interface LineStatusReportItem {
  id: string;
  status: PassengerStatus;
  delayMinutes: number | null;
  notes: string;
  created: string;
  stations: Array<{ id: string; displayName: string }>;
  user: { shortId: string; nickname: string } | null;
}

interface LineStatusReportEdge {
  node: LineStatusReportItem;
  cursor: string;
}

interface LineStatusReportPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface LineStatusReportConnection {
  edges: LineStatusReportEdge[];
  pageInfo: LineStatusReportPageInfo;
}

/* ---------------------------------------------------------------------- *
 * calendarIncidents — the Pro dashboard's "recent incidents" widget
 * ---------------------------------------------------------------------- */

/**
 * 🔴 **THE VARIABLES ARE COMPILE-TIME CONSTANTS, AND THAT IS THE WHOLE REASON THIS DOCUMENT EXISTS.**
 *
 * The obvious way to write a "recent incidents" widget is a `date: { range: … }` spanning the last
 * few days, and that is exactly the shape this project cannot ship: a client clock baked into query
 * variables makes the server render and the client hydration compute DIFFERENT variables, so the SSR
 * TransferState payload is not reused and every read fires twice (the same rule that makes the
 * feed's `lastWeekOnly` a backend-computed boolean).
 *
 * So the window is expressed in terms the backend can answer without being told what time it is:
 * `ongoing: true` (backend `end_datetime IS NULL` — "no end date yet") ordered by
 * `startDatetime DESC`. Every value is a literal in the source, so the variables object is
 * structurally identical in every process, which is the property the whole home contract rests on.
 *
 * `calendarIncidents` returns a LIST, not a connection, and takes no `first`/`after` — so "the
 * newest N" is expressed by ORDER plus a client-side slice, which is what the widget does. The
 * consequence, stated so nobody is surprised by it: this is one full payload of ongoing incidents
 * and the widget shows the first {@link PRO_INCIDENT_LIMIT} of it, which is honest ("the newest
 * ongoing ones") rather than a truncated "recent" window pretending to be complete.
 *
 * The selection is deliberately MINIMAL — six scalars plus the lines the incident touches. The
 * insiden page's own document selects `details`, `medias`, `chronologies` and a first page of
 * `links` per incident because its cards render them; this widget draws one row per incident, so
 * asking for them would multiply payload and resolver fan-out across the whole dataset for fields
 * nothing here reads.
 */
export const HOME_RECENT_INCIDENTS_QUERY = /* GraphQL */ `
  query HomeRecentIncidents($filters: CalendarIncidentFilter, $order: CalendarIncidentOrder) {
    calendarIncidents(filters: $filters, order: $order) {
      id
      startDatetime
      endDatetime
      severity
      title
      brief
      lines {
        id
        code
      }
    }
  }
`;

/** The one and only variables object this document is ever read with. Frozen so no caller can mutate
 * the shared constant into something the server render never sent. */
export const HOME_RECENT_INCIDENT_VARS = Object.freeze({
  filters: { OR: { ongoing: true } },
  order: { startDatetime: "DESC" },
});

export interface HomeRecentIncidentsQueryVars {
  filters: Record<string, unknown>;
  order: Record<string, unknown>;
}

/** The severity axis, mirroring the backend's `CalendarIncidentSeverity` enum. */
export type HomeIncidentSeverity = "MAJOR" | "MINOR" | "OTHERS";

/** One incident row in the Pro widget — the six scalars plus the lines it touches. */
export interface HomeIncidentItem {
  id: string;
  /** Naive local wall time, no offset (backend `USE_TZ = False`) — never re-formatted through UTC. */
  startDatetime: string;
  /** `null` while the incident is still open; a resolved one carries its end instant. */
  endDatetime: string | null;
  severity: HomeIncidentSeverity;
  title: string;
  brief: string;
  lines: Array<{ id: string; code: string }>;
}

export interface HomeRecentIncidentsQueryData {
  calendarIncidents: HomeIncidentItem[];
}

/** How many incident rows the Pro widget shows. The backend takes no limit, so this is a
 *  client-side slice of the newest-first list — see the document's own note on why. */
export const PRO_INCIDENT_LIMIT = 6;

/* ---------------------------------------------------------------------- *
 * Mutations
 * ---------------------------------------------------------------------- */

export const SUBMIT_FEED_LINK_MUTATION = /* GraphQL */ `
  mutation SubmitFeedLink($input: FeedLinkInput!) {
    submitFeedLink(input: $input) {
      ok
      isDuplicate
      duplicateOfId
      userVote
      link {
        id
        url
        normalizedUrl
        title
        created
        # The sub-select MIRRORS the FeedLink node selection, which is why it carries
        # everything FeedLink declares: the payload's own type says the link IS a
        # FeedLink, so a partial selection would make that type a lie, and any host
        # that ever renders or optimistically patches this row (a link whose event
        # time the user just chose, a thread wrapper reading counts) would find a hole
        # in it. The feed is NOT prepended from here: the submit box emits "submitted"
        # and the page calls store.reloadAll(), which re-reads the collapsed feed — so
        # nothing renders this payload today and the shape is a contract, not a
        # shortcut. A brand-new link is by definition a ROOT of its own: parentId
        # null, isThreadRoot true, sublinkCount 0, sublinks []. The four-level
        # nesting mirrors FEED_QUERY exactly, because the payload's declared type
        # IS FeedLink and FeedLink.sublinks is a required four-level tree — a
        # one-level mirror here would make the type a lie, and the day a host
        # renders this payload through the recursive thread wrapper it would render
        # a hole. The wire cost is one [] per level on a link that has no
        # children yet.
        #
        # The three EDIT ROUND-TRIP relations are mirrored for the same reason and
        # carry the same minimal identifying pairs: FeedLink declares all three as
        # REQUIRED, so a payload without them describes a link the server never
        # returned — and the tags are precisely what an edit round-trip reads (see the
        # FeedLink doc comment; SocialMediaLinkInput is replace-not-patch, so an
        # absent relation is a blanked one).
        occurredAt
        parentId
        isThreadRoot
        sublinkCount
        sublinks {
          id
          url
          title
          created
          occurredAt
          parentId
          isThreadRoot
          sublinkCount
          status
          completed
          isAutomated
          voteScore
          userVote
          voteBreakdown {
            upvotes
            downvotes
          }
          lines {
            id
            code
            displayName
          }
          # Edit round-trip tags — NOT rendered by the card, and selected ONLY so
          # this row can hand its own tags back to the edit sheet. SocialMediaLinkInput
          # is replace-not-patch, so a payload that omits a relation does not leave it
          # alone, it BLANKS it — see the FeedLink doc comment. Minimal identifying pairs
          # on purpose: the Vehicle scalar also carries vehicleType, incidents,
          # spottings and spottingTrends(...), so selecting all of it would multiply
          # payload and resolver fan-out on every row of every feed page.
          vehicles {
            id
            identificationNo
          }
          stations {
            id
            displayName
          }
          categories {
            id
            name
          }
          user {
            shortId
            nickname
          }
          sublinks {
            id
            url
            title
            created
            occurredAt
            parentId
            isThreadRoot
            sublinkCount
            status
            completed
            isAutomated
            voteScore
            userVote
            voteBreakdown {
              upvotes
              downvotes
            }
            lines {
              id
              code
              displayName
            }
            # Edit round-trip tags — NOT rendered by the card, and selected ONLY so
            # this row can hand its own tags back to the edit sheet. SocialMediaLinkInput
            # is replace-not-patch, so a payload that omits a relation does not leave it
            # alone, it BLANKS it — see the FeedLink doc comment. Minimal identifying pairs
            # on purpose: the Vehicle scalar also carries vehicleType, incidents,
            # spottings and spottingTrends(...), so selecting all of it would multiply
            # payload and resolver fan-out on every row of every feed page.
            vehicles {
              id
              identificationNo
            }
            stations {
              id
              displayName
            }
            categories {
              id
              name
            }
            user {
              shortId
              nickname
            }
            sublinks {
              id
              url
              title
              created
              occurredAt
              parentId
              isThreadRoot
              sublinkCount
              status
              completed
              isAutomated
              voteScore
              userVote
              voteBreakdown {
                upvotes
                downvotes
              }
              lines {
                id
                code
                displayName
              }
              # Edit round-trip tags — NOT rendered by the card, and selected ONLY so
              # this row can hand its own tags back to the edit sheet. SocialMediaLinkInput
              # is replace-not-patch, so a payload that omits a relation does not leave it
              # alone, it BLANKS it — see the FeedLink doc comment. Minimal identifying pairs
              # on purpose: the Vehicle scalar also carries vehicleType, incidents,
              # spottings and spottingTrends(...), so selecting all of it would multiply
              # payload and resolver fan-out on every row of every feed page.
              vehicles {
                id
                identificationNo
              }
              stations {
                id
                displayName
              }
              categories {
                id
                name
              }
              user {
                shortId
                nickname
              }
              sublinks {
                id
                url
                title
                created
                occurredAt
                parentId
                isThreadRoot
                sublinkCount
                status
                completed
                isAutomated
                voteScore
                userVote
                voteBreakdown {
                  upvotes
                  downvotes
                }
                lines {
                  id
                  code
                  displayName
                }
                # Edit round-trip tags — NOT rendered by the card, and selected ONLY so
                # this row can hand its own tags back to the edit sheet. SocialMediaLinkInput
                # is replace-not-patch, so a payload that omits a relation does not leave it
                # alone, it BLANKS it — see the FeedLink doc comment. Minimal identifying pairs
                # on purpose: the Vehicle scalar also carries vehicleType, incidents,
                # spottings and spottingTrends(...), so selecting all of it would multiply
                # payload and resolver fan-out on every row of every feed page.
                vehicles {
                  id
                  identificationNo
                }
                stations {
                  id
                  displayName
                }
                categories {
                  id
                  name
                }
                user {
                  shortId
                  nickname
                }
              }
            }
          }
        }
        # Also the approval/provenance pair, which the card renders as its Pending
        # pill and Official chip — a link submitted through the feed box lands
        # PENDING_APPROVAL, so a payload that omitted these described a link that
        # reads as already approved.
        status
        completed
        isAutomated
        voteScore
        userVote
        voteBreakdown {
          upvotes
          downvotes
        }
        lines {
          id
          code
          displayName
        }
        # Edit round-trip tags — NOT rendered by the card, and selected ONLY so
        # this row can hand its own tags back to the edit sheet. SocialMediaLinkInput
        # is replace-not-patch, so a payload that omits a relation does not leave it
        # alone, it BLANKS it — see the FeedLink doc comment. Minimal identifying pairs
        # on purpose: the Vehicle scalar also carries vehicleType, incidents,
        # spottings and spottingTrends(...), so selecting all of it would multiply
        # payload and resolver fan-out on every row of every feed page.
        vehicles {
          id
          identificationNo
        }
        stations {
          id
          displayName
        }
        categories {
          id
          name
        }
        user {
          shortId
          nickname
        }
      }
    }
  }
`;

/** `FeedLinkInput` — the home feed's inline submit box. Mirrors the backend input's
 *  optionality: every field past `url` may be omitted. */
interface FeedLinkInput {
  url: string;
  title?: string | null;
  /** "When did this happen". Backend `Maybe[datetime | None]`: OMIT or send `null` and the
   *  backend stamps the submission instant; send a value and it is stored verbatim and becomes
   *  the leading key of every feed ordering. There is deliberately NO update path here (the
   *  feed has no edit — a repeat submission of the same canonical URL returns the existing
   *  row untouched), so unlike `SocialMediaLinkInput.occurredAt` there is no "reset to
   *  submitted" state to express. Naive local wall time: build the value with
   *  `occurredAtInputToIso` (features/insiden/data/link-occurred-at.util.ts), never
   *  `new Date(...).toISOString()`, which would convert to UTC and shift it 8 hours. */
  occurredAt?: string | null;
  lineIds?: string[];
  stationIds?: string[];
  status?: PassengerStatus | null;
  delayMinutes?: number | null;
  notes?: string | null;
}

export interface SubmitFeedLinkVars {
  input: FeedLinkInput;
}

export interface SubmitFeedLinkData {
  submitFeedLink: {
    ok: boolean;
    link: FeedLink;
    isDuplicate: boolean;
    duplicateOfId: number | null;
    userVote: number;
  };
}

export const SUBMIT_LINE_STATUS_REPORT_MUTATION = /* GraphQL */ `
  mutation SubmitLineStatusReport($input: LineStatusReportInput!) {
    submitLineStatusReport(input: $input) {
      ok
      id
    }
  }
`;

interface LineStatusReportInput {
  lineId: string;
  status: PassengerStatus;
  stationIds?: string[];
  delayMinutes?: number | null;
  notes?: string | null;
}

export interface SubmitLineStatusReportVars {
  input: LineStatusReportInput;
}

export interface SubmitLineStatusReportData {
  submitLineStatusReport: { ok: boolean; id: number | null };
}

/* ---------------------------------------------------------------------- *
 * Link vote mutations. 🔴 They acknowledge with the vote state the write
 * produced — `userVote` / `voteScore` / `upvotes` / `downvotes` — and NOT with a
 * bare `ok`. A client given only `ok` has to project the new score itself, and
 * that projection then races its own echo (the host writes the value back down
 * as `userVote`, which re-seeds the control) plus any other voter, so the score
 * visibly snaps back to a pre-click number. Repainting from this response makes
 * the mutation the single source of truth — see `voteStateFromAcknowledgement`.
 * ---------------------------------------------------------------------- */

export const UPVOTE_SOCIAL_MEDIA_LINK_MUTATION = /* GraphQL */ `
  mutation UpvoteSocialMediaLink($id: ID!) {
    upvoteSocialMediaLink(socialMediaLinkId: $id) {
      ok
      userVote
      voteScore
      upvotes
      downvotes
    }
  }
`;

export const DOWNVOTE_SOCIAL_MEDIA_LINK_MUTATION = /* GraphQL */ `
  mutation DownvoteSocialMediaLink($id: ID!) {
    downvoteSocialMediaLink(socialMediaLinkId: $id) {
      ok
      userVote
      voteScore
      upvotes
      downvotes
    }
  }
`;

export const REMOVE_SOCIAL_MEDIA_LINK_VOTE_MUTATION = /* GraphQL */ `
  mutation RemoveSocialMediaLinkVote($id: ID!) {
    removeSocialMediaLinkVote(socialMediaLinkId: $id) {
      ok
      userVote
      voteScore
      upvotes
      downvotes
    }
  }
`;

export interface SocialMediaLinkVoteVars {
  id: string;
}

/** The `VoteMutationPayload` the three link vote mutations return — the same type
 * the incident and chronology vote mutations acknowledge with. */
export interface SocialMediaLinkVotePayload extends VoteAcknowledgement {
  ok: boolean;
}

export interface SocialMediaLinkVoteData {
  upvoteSocialMediaLink?: SocialMediaLinkVotePayload;
  downvoteSocialMediaLink?: SocialMediaLinkVotePayload;
  removeSocialMediaLinkVote?: SocialMediaLinkVotePayload;
}
