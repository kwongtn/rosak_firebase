import { SpottingType, VehicleStatus } from "../../../core/graphql/types";

/* ---------------------------------------------------------------------- *
 * user — profile identity + stats + spotting trend + favourite vehicle.
 * See docs/frontend-map/profile.md § Data & API Contracts.
 * ---------------------------------------------------------------------- */

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
          identificationNo
          lines {
            code
          }
        }
        count
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
          identificationNo
          lines {
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

export interface DateTrend {
  dateKey: string;
  year: number;
  month: number | null;
  day: number | null;
  count: number;
}

export interface SpottingTrendPoint extends DateTrend {
  eventType: SpottingType;
}

export interface FavouriteVehicle {
  vehicle: {
    identificationNo: string;
    lines: { code: string }[];
  };
  count: number;
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
      vehicle {
        id
        status
        identificationNo
        vehicleType {
          internalName
        }
        lines {
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
  status: VehicleStatus;
  type: SpottingType;
  runNumber: string | null;
  mediaCount: number;
  isMine: boolean;
  vehicle: {
    id: string;
    status: VehicleStatus;
    identificationNo: string;
    vehicleType: { internalName: string };
    lines: { code: string }[];
  };
}

export interface GetMyEventsData {
  events: MyEvent[];
}

/* ---------------------------------------------------------------------- *
 * deleteEvent — server enforces both ownership and a 3-day window
 * (spotting/schema/schema.py) regardless of what the client thinks
 * `canDelete` should be — see docs/frontend-map/profile.md Known Quirks
 * for the old app's client/server window mismatch, which this rewrite
 * fixes by just computing the 3-day window correctly.
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
