/**
 * GraphQL documents + hand-written types for the station page (`/station/:id`). Field names are
 * copied from the deployed Strawberry schema (the backend is the source of truth); no codegen.
 */

import type { AssetStatus, LineStatus } from "../../../core/graphql/types";
import type { HomeIncidentSeverity } from "../../home/data/home-incidents.queries";
import type { PassengerStatus } from "../../home/data/home.queries";
import type { AssetType } from "../../spotting/data/spotting.queries";

/** How many of the station's other approved incidents "Recent incidents" lists. A published number
 *  (`STATION_INCIDENT_HISTORY_LIMIT` in the methodology registry); the page spec pins the two. */
export const STATION_INCIDENT_HISTORY_LIMIT = 10;

/** How many of each serving line's newest status reports the page searches for this station. A
 *  published number (`STATION_REPORTS_PER_LINE` in the methodology registry), pinned the same way. */
export const STATION_REPORTS_PER_LINE = 10;

/**
 * The page's one server-rendered read: the station, the lines that serve it with their current
 * status, its assets, and its incidents. Its only variable is the route's `id`, so the server render
 * and the hydrated page send the same request and the browser reuses the transferred answer.
 *
 * 🔴 `status: LIVE` on both incident reads: the root `calendarIncidents` field has no status gate, so
 * without it anonymous callers get drafts, pending and rejected reports. `activeNow` is the backend's
 * clock (started, and not ended or open-ended), and `false` is its exact complement, so the two lists
 * never share an incident and no date computed here enters the variables.
 *
 * shortcut: `calendarIncidents` takes no limit, so `history` is the station's whole approved history
 * (a few scalars per incident) and the page shows the newest {@link STATION_INCIDENT_HISTORY_LIMIT};
 * ask the backend for a `first` argument if a station's history grows large.
 *
 * Never select `Asset.stations` (removed; the FK is `Asset.station`) or `location` (no map here).
 */
export const STATION_PAGE_QUERY = /* GraphQL */ `
  query StationPage($id: ID!) {
    stations(filters: { id: $id }) {
      id
      displayName
      lines {
        id
        code
        displayName
        status
        passengerStatus
      }
      assets {
        id
        assetType
        status
        officialid
        shortDescription
        longDescription
      }
    }
    current: calendarIncidents(
      filters: { status: LIVE, activeNow: true, stations: { id: $id } }
      order: { startDatetime: DESC }
    ) {
      id
      startDatetime
      severity
      title
    }
    history: calendarIncidents(
      filters: { status: LIVE, activeNow: false, stations: { id: $id } }
      order: { startDatetime: DESC }
    ) {
      id
      startDatetime
      severity
      title
    }
  }
`;

export interface StationPageQueryVars {
  id: string;
}

/** A line that serves the station, with the two status fields the board reads. */
export interface StationLine {
  id: string;
  code: string;
  displayName: string;
  status: LineStatus;
  /** The rider-reported status in the line's current window; `null` when nobody reported. */
  passengerStatus: PassengerStatus | null;
}

export interface StationAsset {
  id: string;
  assetType: AssetType;
  status: AssetStatus;
  officialid: string;
  shortDescription: string;
  longDescription: string;
}

export interface StationIncident {
  id: string;
  /** Naive Kuala Lumpur wall time, no offset (backend `USE_TZ = False`). */
  startDatetime: string;
  severity: HomeIncidentSeverity;
  title: string;
}

export interface Station {
  id: string;
  displayName: string;
  lines: StationLine[];
  assets: StationAsset[];
}

export interface StationPageQueryData {
  stations: Station[];
  current: StationIncident[];
  history: StationIncident[];
}

const STATION_REPORT_FIELDS = /* GraphQL */ `
  fragment StationReportFields on LineStatusReportScalar {
    id
    status
    delayMinutes
    notes
    created
    stations {
      id
    }
  }
`;

/**
 * The reports read: the newest {@link STATION_REPORTS_PER_LINE} status reports of every line that
 * serves the station, one aliased `lineStatusReports` per line (`line0`, `line1`, …, in the order
 * given) in ONE request. The backend has no station filter on reports, so the page keeps the ones
 * that name the station (`stationTaggedReports`). The line ids travel as variables, never inside
 * the document text. Throws on an empty list, which would be an invalid document.
 */
export function stationReportsRequest(lineIds: readonly string[]): {
  query: string;
  variables: Record<string, string | number>;
} {
  if (lineIds.length === 0) {
    throw new Error("stationReportsRequest needs at least one line id");
  }
  const declarations = lineIds.map((_, index) => `$line${index}: ID!`).join(", ");
  const fields = lineIds
    .map(
      (_, index) =>
        `line${index}: lineStatusReports(lineId: $line${index}, first: $first) { edges { node { ...StationReportFields } } }`,
    )
    .join("\n");
  const variables: Record<string, string | number> = { first: STATION_REPORTS_PER_LINE };
  lineIds.forEach((id, index) => {
    variables[`line${index}`] = id;
  });
  return {
    query: `query StationReports($first: Int!, ${declarations}) {\n${fields}\n}\n${STATION_REPORT_FIELDS}`,
    variables,
  };
}

export interface StationReportNode {
  id: string;
  status: PassengerStatus;
  delayMinutes: number | null;
  notes: string;
  created: string;
  stations: Array<{ id: string }>;
}

/** The reports answer, keyed by the aliases `stationReportsRequest` wrote (`line0`, `line1`, …). */
export type StationReportsQueryData = Record<
  string,
  { edges: Array<{ node: StationReportNode }> } | null | undefined
>;
