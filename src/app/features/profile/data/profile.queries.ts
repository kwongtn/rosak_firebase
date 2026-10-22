import { SpottingType, SpottingVehicleStatus, VehicleStatus } from "../../../core/graphql/types";

/* ---------------------------------------------------------------------- *
 * user — profile identity + stats + spotting trend + favourite vehicle.
 * ---------------------------------------------------------------------- */

/**
 * The own profile's first read, the one the page waits on. Its `favouriteVehicles` keeps the default
 * count of one: that is the favourite train, and nothing below the fold may make this request
 * slower. The whole list the Fleet progress card needs is its own, non-blocking read
 * ({@link GET_FLEET_PROGRESS_QUERY}).
 */
export const GET_USER_DATA_QUERY = /* GraphQL */ `
  query GetUserData($typeGroup: Boolean, $freeRange: Boolean) {
    user {
      nickname
      spottingsCount
      mediaCount
      spottingDataPublic
      spottingTrends(typeGroup: $typeGroup, freeRange: $freeRange) {
        dateKey
        year
        month
        day
        eventType
        count
      }
      withMostEntriesMonth: withMostEntries(type: MONTH) {
        dateKey
        year
        month
        day
        count
      }
      withMostEntriesDay: withMostEntries(type: DAY) {
        dateKey
        year
        month
        day
        count
      }
      favouriteVehicles {
        vehicle {
          id
          identificationNo
          lines {
            id
            code
          }
        }
        count
      }
    }
  }
`;

/* ---------------------------------------------------------------------- *
 * user.favouriteVehicles(count: FLEET_FAVOURITES_COUNT) — every distinct vehicle the caller has
 * logged, for the Fleet progress card. Its own request so the profile's first paint does not wait
 * on it: `Vehicle.lines` resolves once per vehicle (about 1.3 s extra for a 406-vehicle spotter on
 * the dev stack), and the card sits below the fold.
 * ---------------------------------------------------------------------- */

/**
 * How many favourite vehicles the fleet-progress read asks for. It must stay above the number of
 * vehicles in the system (about 600), so the answer is the whole set and not a top-N: a count below
 * the fleet would silently under-report progress, and nothing in the answer says it was cut. The
 * card reports an answer that reaches this size to Sentry (see `FleetProgressComponent`).
 */
export const FLEET_FAVOURITES_COUNT = 1000;

/**
 * Each vehicle carries its lines with `totalVehicleCount`, the line's whole fleet and the progress
 * denominator. Only the vehicle id and its lines are selected: the card groups by line, and the
 * missing vehicles' numbers come from the line roster (`LINE_FLEET_QUERY`).
 *
 * OWN PROFILE ONLY. The resolver ignores `spottingDataPublic`, so asking for more than the default
 * count in `GET_PUBLIC_USER_QUERY` would list every vehicle an opted-out user has spotted.
 */
export const GET_FLEET_PROGRESS_QUERY = /* GraphQL */ `
  query GetFleetProgress {
    user {
      favouriteVehicles(count: ${FLEET_FAVOURITES_COUNT}) {
        vehicle {
          id
          lines {
            id
            code
            totalVehicleCount
          }
        }
      }
    }
  }
`;

export const GET_PUBLIC_USER_QUERY = /* GraphQL */ `
  query GetPublicUser($id: ID!, $typeGroup: Boolean, $freeRange: Boolean) {
    publicUser(id: $id) {
      nickname
      spottingsCount
      mediaCount
      spottingDataPublic
      spottingTrends(typeGroup: $typeGroup, freeRange: $freeRange) {
        dateKey
        year
        month
        day
        eventType
        count
      }
      withMostEntriesMonth: withMostEntries(type: MONTH) {
        dateKey
        year
        month
        day
        count
      }
      withMostEntriesDay: withMostEntries(type: DAY) {
        dateKey
        year
        month
        day
        count
      }
      favouriteVehicles {
        vehicle {
          id
          identificationNo
          lines {
            id
            code
          }
        }
        count
      }
      spottings {
        id
        spottingDate
        notes
        created
        status
        type
        runNumber
        mediaCount
        isMine
        vehicle {
          id
          status
          identificationNo
          vehicleType {
            internalName
          }
          lines {
            id
            code
          }
        }
      }
    }
  }
`;

export interface GetUserDataVars {
  typeGroup: boolean;
  freeRange: boolean;
}

export interface GetPublicUserVars {
  id: string;
  typeGroup: boolean;
  freeRange: boolean;
}

interface DateTrend {
  dateKey: string;
  year: number;
  month: number | null;
  day: number | null;
  count: number;
}

interface SpottingTrendPoint extends DateTrend {
  eventType: SpottingType;
}

export interface FavouriteVehicle {
  vehicle: {
    id: string;
    identificationNo: string;
    lines: { id: string; code: string }[];
  };
  count: number;
}

/** One spotted vehicle as `GET_FLEET_PROGRESS_QUERY` returns it: only what the card groups by. */
export interface FleetSpottedVehicle {
  vehicle: {
    id: string;
    /** `totalVehicleCount` is the line's whole fleet, the progress denominator. */
    lines: { id: string; code: string; totalVehicleCount: number }[];
  };
}

export interface GetFleetProgressData {
  user: { favouriteVehicles: FleetSpottedVehicle[] };
}

export interface UserData {
  nickname: string;
  spottingsCount: number;
  mediaCount: number;
  spottingTrends: SpottingTrendPoint[];
  withMostEntriesMonth: DateTrend | null;
  withMostEntriesDay: DateTrend | null;
  favouriteVehicles: FavouriteVehicle[];
  spottingDataPublic: boolean;
}

export interface GetUserDataData {
  user: UserData;
}

export interface PublicUserData extends UserData {
  spottings: MyEvent[] | null; // Can be null if private
}

export interface GetPublicUserData {
  publicUser: PublicUserData | null; // Can be null if user not found
}

/* ---------------------------------------------------------------------- *
 * lines(id).vehicles — one line's whole roster, read when a fleet-progress row is expanded so the
 * vehicles the user has NOT spotted can be listed (roster minus the spotted ids). Public, and
 * the same set `Line.totalVehicleCount` counts: one VehicleLine row per assigned vehicle, whatever
 * its status. The resolver returns an unordered set, so the consumer sorts.
 * ---------------------------------------------------------------------- */

export const LINE_FLEET_QUERY = /* GraphQL */ `
  query LineFleet($lineId: ID!) {
    lines(filters: { id: $lineId }) {
      id
      vehicles {
        id
        identificationNo
      }
    }
  }
`;

export interface LineFleetVars {
  lineId: string;
}

export interface FleetVehicle {
  id: string;
  identificationNo: string;
}

export interface LineFleetData {
  lines: { id: string; vehicles: FleetVehicle[] }[];
}

/* ---------------------------------------------------------------------- *
 * updateUser — nickname edit.
 * ---------------------------------------------------------------------- */

export const UPDATE_USER_MUTATION = /* GraphQL */ `
  mutation UpdateUser($data: UserInput!) {
    updateUser(input: $data) {
      nickname
      spottingDataPublic
    }
  }
`;

export interface UpdateUserVars {
  data: {
    nickname: string;
    spottingDataPublic?: boolean;
  };
}

export interface UpdateUserData {
  updateUser: { nickname: string };
}

/* ---------------------------------------------------------------------- *
 * events (onlyMine) — the user's own spotting history, paginated.
 * ---------------------------------------------------------------------- */

export const GET_MY_EVENTS_QUERY = /* GraphQL */ `
  query GetMyEvents($limit: Int!, $offset: Int!) {
    events(
      filters: { onlyMine: true }
      order: { created: DESC }
      pagination: { limit: $limit, offset: $offset }
    ) {
      id
      spottingDate
      notes
      created
      status
      type
      runNumber
      mediaCount
      isMine
      originStation {
        displayName
      }
      destinationStation {
        displayName
      }
      vehicle {
        id
        status
        identificationNo
        vehicleType {
          internalName
        }
        lines {
          id
          code
        }
      }
    }
  }
`;

export interface GetMyEventsVars {
  limit: number;
  offset: number;
}

export interface MyEvent {
  id: string;
  spottingDate: string;
  notes: string | null;
  created: string;
  status: SpottingVehicleStatus;
  type: SpottingType;
  runNumber: string | null;
  mediaCount: number;
  isMine: boolean;
  /** Selected by `GET_MY_EVENTS_QUERY` only (the export reads them); a public profile's list omits them. */
  originStation?: { displayName: string } | null;
  destinationStation?: { displayName: string } | null;
  vehicle: {
    id: string;
    status: VehicleStatus;
    identificationNo: string;
    vehicleType: { internalName: string };
    lines: { id: string; code: string }[];
  };
}

export interface GetMyEventsData {
  events: MyEvent[];
}

/* ---------------------------------------------------------------------- *
 * myVotesCast — the caller's aggregate votes cast (Task 25, spec AC3).
 * Root-level query (NOT on `user`): spec shows only the total — what was
 * voted on stays private, so no per-content-type fields exist or are wanted.
 * Requires the firebase-auth-key header (IsLoggedIn).
 * ---------------------------------------------------------------------- */

export const GET_MY_VOTES_CAST_QUERY = /* GraphQL */ `
  query GetMyVotesCast {
    myVotesCast
  }
`;

export interface MyVotesCastData {
  myVotesCast: number;
}

/* ---------------------------------------------------------------------- *
 * deleteEvent — server enforces both ownership and a 3-day window
 * (spotting/schema/schema.py) regardless of what the client thinks
 * `canDelete` should be, so the client just computes the same 3-day window.
 * ---------------------------------------------------------------------- */

export const DELETE_EVENT_MUTATION = /* GraphQL */ `
  mutation DeleteMyEvent($deleteEventInput: DeleteEventInput!) {
    deleteEvent(input: $deleteEventInput) {
      ok
    }
  }
`;

export interface DeleteEventVars {
  deleteEventInput: { id: string };
}

export interface DeleteEventData {
  deleteEvent: { ok: boolean };
}

export const DELETE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
