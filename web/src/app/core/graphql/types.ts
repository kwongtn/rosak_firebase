/**
 * Enums/scalars mirrored from the rosak_backend Strawberry schema, scoped to what
 * /spotting needs. See docs/frontend-map/spotting.md and shared-services-and-plumbing.md
 * in the repo root for the source-verified field-by-field mapping.
 */

export type LineStatus =
    | "TESTING"
    | "DEFUNCT"
    | "ACTIVE"
    | "PARTIAL_ACTIVE"
    | "PARTIAL_DISRUPTION"
    | "TOTAL_DISRUPTION";

/** operation.enums.VehicleStatus — a vehicle's actual current status. */
export type VehicleStatus =
    | "IN_SERVICE"
    | "NOT_SPOTTED"
    | "OUT_OF_SERVICE"
    | "DECOMMISSIONED"
    | "MARRIED"
    | "TESTING"
    | "UNKNOWN";

/** spotting.enums.SpottingVehicleStatus — the narrower set a user can report. */
export type SpottingVehicleStatus =
    | "IN_SERVICE"
    | "NOT_IN_SERVICE"
    | "DECOMMISSIONED"
    | "TESTING";

/** spotting.enums.SpottingWheelStatus */
export type WheelStatus =
    | "FRESH"
    | "NEAR_PERFECT"
    | "FLAT"
    | "WORN_OUT"
    | "WORRYING";

/** spotting.enums.SpottingEventType */
export type SpottingType =
    | "DEPOT"
    | "LOCATION"
    | "BETWEEN_STATIONS"
    | "JUST_SPOTTING"
    | "AT_STATION";

/** incident.enums.IncidentSeverity (vehicle-incident timeline only — distinct from CalendarIncidentSeverity) */
export type IncidentSeverity = "CRITICAL" | "TRIVIA" | "STATUS";

export interface GraphQLError {
    message: string;
    path?: (string | number)[];
}

export interface GraphQLResponse<TData> {
    data?: TData;
    errors?: GraphQLError[];
}
