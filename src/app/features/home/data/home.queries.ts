/**
 * Schema vocabulary for the community front page's data layer — the four enums mirrored
 * verbatim from the deployed Strawberry schema. Split out of the former monolithic
 * `home.queries.ts` so every domain query module (board / feed / history / incidents)
 * imports only the vocabulary it needs.
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
