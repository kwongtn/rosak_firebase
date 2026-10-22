/**
 * Schema vocabulary for the community front page's data layer — the four enums the domain query
 * modules (board / feed / history / incidents) import. Re-exported from `core/graphql/types.ts`,
 * which holds the one copy of each schema enum union.
 */
export type {
  LineStatus,
  PassengerStatus,
  SocialMediaLinkStatus,
  VehicleStatus,
} from "../../../core/graphql/types";
