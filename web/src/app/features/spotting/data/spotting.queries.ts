import {
    IncidentSeverity,
    LineStatus,
    SpottingType,
    VehicleStatus,
    WheelStatus,
} from "../../../core/graphql/types";

/* ---------------------------------------------------------------------- *
 * lines — line tabs / redirect target for bare /spotting
 * See docs/frontend-map/spotting.md § Data & API Contracts, "lines (query)".
 * ---------------------------------------------------------------------- */

export const LINES_QUERY = /* GraphQL */ `
    query Lines {
        lines {
            id
            code
            displayName
            status
        }
    }
`;

export interface LinesQueryData {
    lines: Line[];
}

export interface Line {
    id: string;
    code: string;
    displayName: string;
    status: LineStatus;
}

/* ---------------------------------------------------------------------- *
 * vehicleTypes — per-line fleet table.
 * `DISTINCT: true` is required: the `vehicleTypes(filters: {lineId})` resolver joins through
 * vehicle↔line rows, so without it the same VehicleType comes back once per join match (up to
 * one row per vehicle on that line). Confirmed directly against the live backend — a docs pass
 * had previously (incorrectly) flagged this field as dead/unrecognized; it is real and load-
 * bearing.
 * ---------------------------------------------------------------------- */

export const VEHICLE_TYPES_QUERY = /* GraphQL */ `
    query VehicleTypesByLine($lineId: ID!) {
        vehicleTypes(filters: { lineId: $lineId, DISTINCT: true }) {
            id
            internalName
            displayName
            vehicleStatusInServiceCount
            vehicleStatusNotSpottedCount
            vehicleStatusOutOfServiceCount
            vehicleStatusDecommissionedCount
            vehicleStatusMarriedCount
            vehicleStatusTestingCount
            vehicleStatusUnknownCount
            vehicleTotalCount
            vehicles {
                id
                identificationNo
                status
                nickname
                lastSpottingDate
                inServiceSince
                spottingCount
                notes
                incidentCount
                wheelStatus
            }
        }
    }
`;

export interface VehicleTypesQueryVars {
    lineId: string;
}

export interface VehicleTypesQueryData {
    vehicleTypes: VehicleType[];
}

export interface VehicleType {
    id: string;
    internalName: string;
    displayName: string;
    vehicleStatusInServiceCount: number;
    vehicleStatusNotSpottedCount: number;
    vehicleStatusOutOfServiceCount: number;
    vehicleStatusDecommissionedCount: number;
    vehicleStatusMarriedCount: number;
    vehicleStatusTestingCount: number;
    vehicleStatusUnknownCount: number;
    vehicleTotalCount: number;
    vehicles: VehicleRow[];
}

export interface VehicleRow {
    id: string;
    identificationNo: string;
    status: VehicleStatus;
    nickname: string | null;
    lastSpottingDate: string | null;
    inServiceSince: string | null;
    spottingCount: number;
    notes: string | null;
    incidentCount: number;
    wheelStatus: WheelStatus | null;
}

/* ---------------------------------------------------------------------- *
 * GetLinesAndVehicles — lightweight, unfiltered lines+vehicles for the
 * report-form's line/vehicle dropdowns (no status counts, no history).
 * ---------------------------------------------------------------------- */

export const LINES_AND_VEHICLES_QUERY = /* GraphQL */ `
    query LinesAndVehicles {
        lines {
            id
            code
            displayName
            vehicleTypes {
                id
                internalName
                displayName
                vehicles {
                    id
                    identificationNo
                    status
                }
            }
        }
    }
`;

export interface LinesAndVehiclesQueryData {
    lines: Array<{
        id: string;
        code: string;
        displayName: string;
        vehicleTypes: Array<{
            id: string;
            internalName: string;
            displayName: string;
            vehicles: Array<{ id: string; identificationNo: string; status: VehicleStatus }>;
        }>;
    }>;
}

/* ---------------------------------------------------------------------- *
 * stationLines — per-line station dropdowns for BETWEEN_STATIONS/AT_STATION.
 * ---------------------------------------------------------------------- */

export const STATION_LINES_QUERY = /* GraphQL */ `
    query StationLinesByLine($lineId: ID!) {
        stationLines(filters: { line: { id: $lineId } }) {
            id
            displayName
            internalRepresentation
        }
    }
`;

export interface StationLinesQueryVars {
    lineId: string;
}

export interface StationLinesQueryData {
    stationLines: StationLine[];
}

export interface StationLine {
    id: string;
    displayName: string;
    internalRepresentation: string;
}

/* ---------------------------------------------------------------------- *
 * events — paginated per-vehicle spotting history.
 * ---------------------------------------------------------------------- */

export const VEHICLE_EVENTS_QUERY = /* GraphQL */ `
    query VehicleEvents($vehicleId: ID!, $limit: Int!, $offset: Int!) {
        events(
            filters: { vehicle: { id: $vehicleId } }
            order: { spottingDate: DESC }
            pagination: { limit: $limit, offset: $offset }
        ) {
            id
            spottingDate
            status
            type
            notes
            runNumber
            mediaCount
            isMine
            wheelStatus
            location {
                accuracy
                altitudeAccuracy
                heading
                speed
                location
                altitude
            }
            originStation {
                id
                displayName
            }
            destinationStation {
                id
                displayName
            }
        }
    }
`;

export interface VehicleEventsQueryVars {
    vehicleId: string;
    limit: number;
    offset: number;
}

export interface VehicleEventsQueryData {
    events: SpottingEvent[];
}

export interface SpottingEvent {
    id: string;
    spottingDate: string;
    status: VehicleStatus;
    type: SpottingType;
    notes: string | null;
    runNumber: string | null;
    mediaCount: number;
    isMine: boolean;
    wheelStatus: WheelStatus | null;
    location: {
        accuracy: number | null;
        altitudeAccuracy: number | null;
        heading: number | null;
        speed: number | null;
        location: [number, number] | null;
        altitude: number | null;
    } | null;
    originStation: { id: string; displayName: string } | null;
    destinationStation: { id: string; displayName: string } | null;
}

/* ---------------------------------------------------------------------- *
 * vehicle spottings — raw per-event date+type, for the vehicle-detail activity heatmap.
 *
 * Deliberately NOT using `Line.vehicleSpottingTrends` here: that field groups by *both*
 * event type and vehicle across an entire line with `free_range` (no date bound), which the
 * backend computes as a zero-filled cross-product of (days since the line's first-ever event) ×
 * (5 types) × (every vehicle on the line) — confirmed directly against the live backend that this
 * hangs/times out (20s+, no response) for a real line. A single vehicle's own `spottings` list is
 * small (bounded by that vehicle's own spottingCount) and cheap to bucket by day client-side —
 * verified against the live backend at ~0.2s — so the heatmap's per-day/per-type counts are
 * computed here instead of asked of the backend.
 * ---------------------------------------------------------------------- */

export const VEHICLE_SPOTTING_HISTORY_QUERY = /* GraphQL */ `
    query VehicleSpottingHistory($vehicleId: ID!) {
        vehicles(filters: { id: $vehicleId }) {
            spottings {
                spottingDate
                type
            }
        }
    }
`;

export interface VehicleSpottingHistoryQueryVars {
    vehicleId: string;
}

export interface VehicleSpottingHistoryQueryData {
    vehicles: Array<{ spottings: Array<{ spottingDate: string; type: SpottingType }> }>;
}

/* ---------------------------------------------------------------------- *
 * vehicleIncidents — per-vehicle incident timeline.
 * ---------------------------------------------------------------------- */

export const VEHICLE_INCIDENTS_QUERY = /* GraphQL */ `
    query VehicleIncidentsByVehicle($vehicleId: ID!) {
        vehicleIncidents(filters: { vehicle: { id: $vehicleId } }) {
            order
            date
            severity
            title
            brief
            isLast
        }
    }
`;

export interface VehicleIncidentsQueryVars {
    vehicleId: string;
}

export interface VehicleIncidentsQueryData {
    vehicleIncidents: VehicleIncident[];
}

export interface VehicleIncident {
    order: number;
    date: string;
    severity: IncidentSeverity;
    title: string;
    brief: string;
    isLast: boolean;
}

/* ---------------------------------------------------------------------- *
 * Line.vehicleSpottingTrends — per-vehicle, per-day spotting counts across a whole line, for the
 * /spotting/:lineId/details vehicle × date grid.
 *
 * Always pass an explicit, bounded `start`/`end` (a month or so) — confirmed directly against
 * the live backend that a *bounded* range resolves quickly (well under a second), unlike the
 * `freeRange: true`/no-date-bound shape flagged elsewhere in this file, which computes a
 * zero-filled cross-product of every day since the line's first-ever event and genuinely hangs.
 * `addZero: true` fills in the zero-count cells so the grid has no holes for a vehicle that
 * simply wasn't spotted on a given day.
 * ---------------------------------------------------------------------- */

export const LINE_SPOTTING_GRID_QUERY = /* GraphQL */ `
    query LineSpottingGrid($lineId: ID!, $start: Date!, $end: Date!) {
        lines(filters: { id: $lineId }) {
            id
            vehicleSpottingTrends(start: $start, end: $end, dateGroup: DAY, typeGroup: false, freeRange: false, addZero: true) {
                dateKey
                count
                vehicle {
                    id
                }
            }
        }
    }
`;

export interface LineSpottingGridQueryVars {
    lineId: string;
    start: string;
    end: string;
}

export interface LineSpottingGridQueryData {
    lines: Array<{
        id: string;
        vehicleSpottingTrends: Array<{ dateKey: string; count: number; vehicle: { id: string } }>;
    }>;
}

/** Same field, monthly-bucketed and *not* zero-filled, over a wide (multi-year) span — cheap
 * (confirmed ~180 rows / well under a second for a real line's full history) and gives the
 * earliest/latest month that actually has data, which is what the grid's month-navigation
 * buttons use to grey themselves out rather than letting the grid page endlessly into empty
 * months in either direction. */
export const LINE_SPOTTING_BOUNDS_QUERY = /* GraphQL */ `
    query LineSpottingBounds($lineId: ID!, $start: Date!, $end: Date!) {
        lines(filters: { id: $lineId }) {
            id
            vehicleSpottingTrends(start: $start, end: $end, dateGroup: MONTH, typeGroup: false, freeRange: false, addZero: false) {
                dateKey
            }
        }
    }
`;

export interface LineSpottingBoundsQueryVars {
    lineId: string;
    start: string;
    end: string;
}

export interface LineSpottingBoundsQueryData {
    lines: Array<{ id: string; vehicleSpottingTrends: Array<{ dateKey: string }> }>;
}

/* ---------------------------------------------------------------------- *
 * Line.stations[].assets — station-level infrastructure (lifts, escalators…), for the
 * /spotting/:lineId/details "Station Assets" section. Read-only today: the backend model has a
 * `status` field (under/in maintenance) but doesn't expose it over GraphQL yet, and there's no
 * mutation for volunteers to report/update it — this only lists what assets exist per station.
 * ---------------------------------------------------------------------- */

export const LINE_STATION_ASSETS_QUERY = /* GraphQL */ `
    query LineStationAssets($lineId: ID!) {
        lines(filters: { id: $lineId }) {
            id
            stations {
                id
                displayName
                assets {
                    id
                    assetType
                    officialid
                    shortDescription
                }
            }
        }
    }
`;

export interface LineStationAssetsQueryVars {
    lineId: string;
}

export type AssetType = "ESCALATOR" | "LIFT";

export interface StationAsset {
    id: string;
    assetType: AssetType;
    officialid: string | null;
    shortDescription: string | null;
}

export interface LineStationAssetsQueryData {
    lines: Array<{
        id: string;
        stations: Array<{ id: string; displayName: string; assets: StationAsset[] }>;
    }>;
}

/* ---------------------------------------------------------------------- *
 * addEvent — submit a new spotting report.
 * Always send `notes` (even "") — the backend's wheel_status save condition
 * checks input.notes's unset-ness, not wheel_status's (see Known Quirks in
 * spotting.md); this is a backend bug we work around, not something we can
 * fix from the frontend.
 * ---------------------------------------------------------------------- */

export const ADD_SPOTTING_EVENT_MUTATION = /* GraphQL */ `
    mutation AddSpottingEntry($data: EventInput!) {
        addEvent(input: $data) {
            id
        }
    }
`;

export interface WebLocationInput {
    accuracy?: number;
    altitudeAccuracy?: number | null;
    heading?: number | null;
    speed?: number | null;
    latitude?: number;
    longitude?: number;
    altitude?: number | null;
}

export interface AddSpottingEventInput {
    spottingDate: string;
    vehicle: string;
    notes: string;
    runNumber?: string | null;
    status: string;
    type: SpottingType;
    wheelStatus?: WheelStatus | null;
    originStation?: string | null;
    destinationStation?: string | null;
    location?: WebLocationInput | null;
    isAnonymous: boolean;
}

export interface AddSpottingEventVars {
    data: AddSpottingEventInput;
}

export interface AddSpottingEventData {
    addEvent: { id: string };
}
