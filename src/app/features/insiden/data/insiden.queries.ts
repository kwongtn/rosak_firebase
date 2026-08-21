export type CalendarIncidentSeverity = "MAJOR" | "MINOR" | "OTHERS";
export type ChronologyIndicator = "GREEN" | "RED" | "BLUE" | "GRAY";

/* ---------------------------------------------------------------------- *
 * calendarIncidents — line/vehicle/station-level service disruptions. A genuinely different
 * backend model from the vehicleIncidents already used on the spotting vehicle-detail page (see
 * rosak_backend/incident/schema/scalars.py — CalendarIncidentScalar vs VehicleIncident, no shared
 * identity). No filter args needed: `CalendarIncidentFilter` only supports id/severity/a 60-day-
 * windowed date filter, and the whole dataset is small (280 records, ~290KB, ~5s including
 * details+medias — verified directly against the live backend), so everything is fetched once
 * and filtered/grouped client-side rather than juggling per-view queries like the old app did
 * (separate list/details/medias services, lazy-loaded per interaction).
 * ---------------------------------------------------------------------- */

export const GET_INCIDENTS = /* GraphQL */ `
  query GetIncidents {
    calendarIncidents {
      id
      title
    }
  }
`;

export const INSIDEN_INCIDENTS_QUERY = /* GraphQL */ `
  query CalendarIncidents {
    calendarIncidents {
      id
      startDatetime
      endDatetime
      severity
      title
      brief
      details
      hasDetails
      impactFactor
      longTerm
      inaccurate
      lastUpdated
      lines {
        id
        code
        displayName
      }
      vehicles {
        id
        identificationNo
      }
      stations {
        id
        displayName
      }
      chronologies {
        order
        indicator
        datetime
        content
        sourceUrl
      }
      voteScore
      voteBreakdown {
        upvotes
        downvotes
      }
      userVote
      medias {
        file {
          url
        }
        width
        height
      }
    }
  }
`;

export interface CalendarIncidentChronology {
  order: number;
  indicator: ChronologyIndicator;
  datetime: string;
  content: string;
  sourceUrl: string | null;
}

export interface CalendarIncidentMedia {
  file: { url: string };
  width: number;
  height: number;
}

export interface CalendarIncident {
  id: string;
  startDatetime: string;
  endDatetime: string | null;
  severity: CalendarIncidentSeverity;
  title: string;
  brief: string;
  details: string;
  hasDetails: boolean;
  impactFactor: number;
  longTerm: boolean;
  inaccurate: boolean;
  lastUpdated: string;
  lines: { id: string; code: string; displayName: string }[];
  vehicles: { id: string; identificationNo: string }[];
  stations: { id: string; displayName: string }[];
  chronologies: CalendarIncidentChronology[];
  voteScore: number;
  voteBreakdown: { upvotes: number; downvotes: number };
  /** 1 upvoted, -1 downvoted, 0 no vote (matches VoteButtonComponent's VoteValue). */
  userVote: -1 | 0 | 1;
  medias: CalendarIncidentMedia[];
}

export interface InsidenIncidentsQueryData {
  calendarIncidents: CalendarIncident[];
}

export const CREATE_CALENDAR_INCIDENT_MUTATION = /* GraphQL */ `
  mutation CreateCalendarIncident($data: CalendarIncidentInput!) {
    createCalendarIncident(input: $data) {
      ok
      id
    }
  }
`;

export interface CreateCalendarIncidentData {
  createCalendarIncident: { ok: boolean; id: number | null };
}

export interface CreateCalendarIncidentVars {
  data: {
    title: string;
    brief: string;
    details?: string | null;
    startDatetime: string;
    endDatetime?: string | null;
    severity: CalendarIncidentSeverity;
    longTerm?: boolean | null;
    inaccurate?: boolean | null;
    chronologies?: {
      indicator: ChronologyIndicator;
      datetime?: string | null;
      sourceUrl?: string | null;
      content?: string | null;
    }[];
  };
}

export const SUBMIT_CALENDAR_INCIDENT_MUTATION = /* GraphQL */ `
  mutation SubmitCalendarIncident($calendarIncidentId: ID!) {
    submitCalendarIncident(calendarIncidentId: $calendarIncidentId) {
      ok
    }
  }
`;

export interface SubmitCalendarIncidentData {
  submitCalendarIncident: { ok: boolean };
}

export interface SubmitCalendarIncidentVars {
  calendarIncidentId: string;
}

export const UPVOTE_MUTATION = /* GraphQL */ `
  mutation Upvote($incidentId: ID!) {
    upvote(calendarIncidentId: $incidentId)
  }
`;

export const DOWNVOTE_MUTATION = /* GraphQL */ `
  mutation Downvote($incidentId: ID!) {
    downvote(calendarIncidentId: $incidentId)
  }
`;

export const REMOVE_VOTE_MUTATION = /* GraphQL */ `
  mutation RemoveVote($incidentId: ID!) {
    removeVote(calendarIncidentId: $incidentId)
  }
`;

export interface VoteMutationData {
  upvote?: { ok: boolean };
  downvote?: { ok: boolean };
  removeVote?: { ok: boolean };
}

export interface VoteMutationVars {
  incidentId: string;
}
