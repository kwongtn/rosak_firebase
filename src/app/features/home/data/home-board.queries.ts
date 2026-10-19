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
        title
        created
        # The provenance flag: true for a post the OFFICIAL-post ingestion wrote, false for every
        # hand-submitted link. The board's confidence chip and the hero's official callout both
        # read it, so a line the operator has announced itself never reads as merely "confirmed by
        # riders". The field already exists on SocialMediaLinkScalar server-side — selecting it here
        # is additive and costs no new request.
        isAutomated
      }
    }
  }
`;

export interface FrontPageLinesQueryData {
  lines: LinePulse[];
}

/** A pulse link nested under a line — the subset the board reads: the link, its title, when it
 * was reported, and the provenance flag.
 *
 * It is DELIBERATELY FLAT, and the conversation tree does NOT follow it in: the widget renders ONE
 * link row per report with a fixed, single-line budget, a line's pulse is a report about that line
 * rather than a conversation, and `parentId`/`isThreadRoot`/`sublinkCount`/`sublinks` would add
 * per-report payload across every line on the page without changing anything on screen. */
interface LinePulseLink {
  id: string;
  url: string;
  title: string;
  created: string;
  /** True for a post the official-post ingestion wrote (backend `is_automated`). Drives the board's
   * `status-confidence.official` reading and the hero's official-update callout — the ONLY thing
   * that separates "the operator said so" from "N riders think so", so it is read as `=== true` and
   * never as truthiness. */
  isAutomated: boolean;
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
  statusReportCount: number;
  vehicleStatusCounts: Array<{ status: VehicleStatus; count: number }>;
  passengerStatusCount: number;
  passengerStatusCounts?: Array<{ status: PassengerStatus; count: number }>;
  statusWindowMinutes: number;
  pulseLinks: LinePulseLink[];
}
