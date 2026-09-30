/**
 * GraphQL documents + hand-written types for the community front page (Wave 4 data layer).
 * Field names are copied verbatim from the deployed Strawberry schema — the backend is the
 * source of truth. No codegen, no `gql` tag: mirrors the conventions in
 * features/insiden/data/social-links.queries.ts and features/spotting/data/spotting.queries.ts.
 */

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
 * timestamp, so it has no thread UI and therefore selects no thread fields. */
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
  ) {
    publicSocialMediaLinks(
      first: $first
      after: $after
      status: $status
      currentServiceDayOnly: $currentServiceDayOnly
      lastWeekOnly: $lastWeekOnly
      alignPageToDay: $alignPageToDay
      collapseThreads: $collapseThreads
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
          # Thread grouping. threadId/isThreadRoot/threadSize let the feed
          # wrapper decide whether to render a root; threadLinks carries the
          # members so expanding a thread needs no second request.
          threadId
          isThreadRoot
          threadSize
          # Sub-selection = exactly the fields app-link-card renders for one row
          # (see LinkCardItem), so a member can be handed straight to the card by
          # the thread wrapper with no mapping — an omitted field would silently
          # render wrong (e.g. a child with no voteBreakdown shows "0"). Two
          # deliberate details: created IS included even though it is not a
          # displayed field, because the card falls back to it (occurredAt ??
          # created) and LinkCardItem requires it; and completed is included
          # for symmetry with the root node, not because the card reads it.
          # normalizedUrl is deliberately absent — nothing renders it.
          # Depth is 1 by model invariant (thread always points at a root), so
          # no member selects its own threadLinks.
          threadLinks {
            id
            url
            title
            created
            occurredAt
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
            user {
              shortId
              nickname
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
   * The nested `threadLinks` selection above is what makes collapsing useful: only the root
   * row appears in `edges`, and its members arrive inline. Ignored server-side when `mine`
   * is set — this query never sends `mine`.
   */
  collapseThreads?: boolean;
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
  /** Thread grouping (see LinkCardItem for the full contract). `threadId` is
   *  null exactly when this node IS a root; `threadSize` counts only
   *  publicly-visible members, so the badge can never advertise a link that
   *  resolves into moderation. */
  threadId: string | null;
  isThreadRoot: boolean;
  threadSize: number;
  /** Members of this node's thread, oldest first (`occurredAt ASC, id ASC`).
   *  Root excluded, publicly-visible members only, `[]` when unthreaded. */
  threadLinks: FeedLinkThreadMember[];
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
}

/**
 * One member of a feed thread as selected by `FEED_QUERY`'s nested `threadLinks`.
 *
 * Derived from `FeedLink` minus the fields the nested selection does NOT request, on purpose: depth
 * is exactly 1 by model invariant (`thread` always points at a root, so a member has no thread of
 * its own), and the nested sub-selection is the root's selection with those four fields dropped.
 * Spelling it as an `Omit<>` rather than a hand-copied interface means the child can never drift
 * from the parent — the exact failure mode that a structural contract like `LinkCardItem` is
 * designed to make impossible. It satisfies `LinkCardItem` structurally (every required field is
 * present), which is what lets the thread wrapper render a member with no mapping.
 *
 * `normalizedUrl` is in the `Omit` list because the NESTED SELECTION DOES NOT REQUEST IT — nothing
 * renders it, and the root selection's own comment says so at the call site. Leaving it inherited
 * would have this type claim a REQUIRED key that the document never sends, so a member could not be
 * written by hand as a literal without inventing a value the server did not send. It is omitted
 * from the TYPE rather than added to the query on purpose: adding a field no consumer reads to make
 * a type look tidy trades a harmless inaccuracy for a permanent cost on the wire. The root keeps
 * `normalizedUrl` because `FEED_QUERY` and `SUBMIT_FEED_LINK_MUTATION` both select it.
 */
export type FeedLinkThreadMember = Omit<
  FeedLink,
  "threadId" | "isThreadRoot" | "threadSize" | "threadLinks" | "normalizedUrl"
>;

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
        # shortcut. A brand-new link is by definition its own root: threadId null,
        # isThreadRoot true, threadSize 1, threadLinks [].
        occurredAt
        threadId
        isThreadRoot
        threadSize
        threadLinks {
          id
          url
          title
          created
          occurredAt
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
          user {
            shortId
            nickname
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

export const UPVOTE_SOCIAL_MEDIA_LINK_MUTATION = /* GraphQL */ `
  mutation UpvoteSocialMediaLink($id: ID!) {
    upvoteSocialMediaLink(socialMediaLinkId: $id) {
      ok
    }
  }
`;

export const DOWNVOTE_SOCIAL_MEDIA_LINK_MUTATION = /* GraphQL */ `
  mutation DownvoteSocialMediaLink($id: ID!) {
    downvoteSocialMediaLink(socialMediaLinkId: $id) {
      ok
    }
  }
`;

export const REMOVE_SOCIAL_MEDIA_LINK_VOTE_MUTATION = /* GraphQL */ `
  mutation RemoveSocialMediaLinkVote($id: ID!) {
    removeSocialMediaLinkVote(socialMediaLinkId: $id) {
      ok
    }
  }
`;

export interface SocialMediaLinkVoteVars {
  id: string;
}

export interface SocialMediaLinkVoteData {
  upvoteSocialMediaLink?: { ok: boolean };
  downvoteSocialMediaLink?: { ok: boolean };
  removeSocialMediaLinkVote?: { ok: boolean };
}
