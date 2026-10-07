/**
 * GraphQL document + hand-written types for the public feed connection (keyset paginated).
 * Field names are copied verbatim from the deployed Strawberry schema. Split out of the
 * former monolithic `home.queries.ts`; the node/tree types it returns live in
 * `home-feed-items.ts` because FEED_QUERY's document is itself the bulk of the selection.
 */

import type { FeedLinkEdge, FeedLinkPageInfo } from "./home-feed-items";
import type { SocialMediaLinkStatus } from "./home.queries";

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

interface FeedLinkConnection {
  edges: FeedLinkEdge[];
  pageInfo: FeedLinkPageInfo;
  totalCount: number;
}
