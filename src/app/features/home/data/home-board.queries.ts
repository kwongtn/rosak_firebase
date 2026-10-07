/**
 * GraphQL document + hand-written types for the front page's line pulse list — the network
 * board's read. Field names are copied verbatim from the deployed Strawberry schema (the
 * backend is the source of truth); no codegen, no `gql` tag. Split out of the former
 * monolithic `home.queries.ts`.
 */

import type { LineStatus, PassengerStatus, VehicleStatus } from "./home.queries";

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
