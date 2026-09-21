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

export type SocialMediaLinkStatus = "LIVE" | "PENDING_APPROVAL";

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
      pulseLinks {
        id
        url
        normalizedUrl
        title
        created
        voteScore
        userVote
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

/** A pulse link nested under a line — the subset of SocialMediaLinkScalar the front page reads. */
export interface LinePulseLink {
  id: string;
  url: string;
  normalizedUrl: string | null;
  title: string;
  created: string;
  voteScore: number;
  userVote: number;
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
  pulseLinks: LinePulseLink[];
}

/* ---------------------------------------------------------------------- *
 * publicSocialMediaLinks — the public feed (keyset paginated)
 * ---------------------------------------------------------------------- */

export const FEED_QUERY = /* GraphQL */ `
  query Feed($first: Int!, $after: String, $status: SocialMediaLinkStatus) {
    publicSocialMediaLinks(first: $first, after: $after, status: $status) {
      edges {
        node {
          id
          url
          normalizedUrl
          title
          created
          voteScore
          userVote
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
    }
  }
`;

export interface FeedQueryVars {
  first: number;
  after?: string | null;
  status?: SocialMediaLinkStatus | null;
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
  voteScore: number;
  userVote: number;
  lines: Array<{ id: string; code: string; displayName: string }>;
  user: { shortId: string; nickname: string } | null;
}

export interface FeedLinkEdge {
  node: FeedLink;
  cursor: string;
}

export interface FeedLinkPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface FeedLinkConnection {
  edges: FeedLinkEdge[];
  pageInfo: FeedLinkPageInfo;
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
        voteScore
        userVote
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

export interface FeedLinkInput {
  url: string;
  title?: string | null;
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

export interface LineStatusReportInput {
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
