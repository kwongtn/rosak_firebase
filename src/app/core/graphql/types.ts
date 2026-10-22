/**
 * Enums/scalars mirrored from the rosak_backend Strawberry schema. The one copy of each enum
 * union: a feature that needs one imports it from here (or re-exports it, as
 * `features/home/data/home.queries.ts` does) rather than declaring its own.
 */

export type LineStatus =
  "TESTING" | "DEFUNCT" | "ACTIVE" | "PARTIAL_ACTIVE" | "PARTIAL_DISRUPTION" | "TOTAL_DISRUPTION";

/** operation.enums.VehicleStatus — a vehicle's actual current status. */
export type VehicleStatus =
  | "IN_SERVICE"
  | "NOT_SPOTTED"
  | "OUT_OF_SERVICE"
  | "DECOMMISSIONED"
  | "MARRIED"
  | "TESTING"
  | "UNKNOWN";

/** spotting.enums.SpottingVehicleStatus — a spotting event's status (`EventScalar.status`). The
 * report form offers only IN_SERVICE, NOT_IN_SERVICE, DECOMMISSIONED and TESTING. */
export type SpottingVehicleStatus =
  | "IN_SERVICE"
  | "NOT_IN_SERVICE"
  | "DECOMMISSIONED"
  | "TESTING"
  | "NOT_SPOTTED"
  | "MARRIED"
  | "UNKNOWN";

export type PassengerStatus =
  "NORMAL" | "BUSY" | "CROWDED" | "EXTREMELY_CROWDED" | "BACKLOGGED" | "DELAYED" | "DISRUPTED";

/** `HIDDEN` is the backend's moderation state (rosak_backend `SocialMediaLinkStatus.HIDDEN`):
 * the row exists and admins still see it in the console so they can un-hide it, but the public
 * feed never returns it — not even through an explicit `status: HIDDEN` narrowing. */
export type SocialMediaLinkStatus = "LIVE" | "PENDING_APPROVAL" | "HIDDEN";

/** operation.enums.AssetStatus — whether a station asset (lift, escalator) is working. */
export type AssetStatus = "IN_OPERATION" | "UNDER_MAINTENANCE";

/** spotting.enums.SpottingWheelStatus */
export type WheelStatus = "FRESH" | "NEAR_PERFECT" | "FLAT" | "WORN_OUT" | "WORRYING";

/** spotting.enums.SpottingEventType */
export type SpottingType =
  "DEPOT" | "LOCATION" | "BETWEEN_STATIONS" | "JUST_SPOTTING" | "AT_STATION";

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
