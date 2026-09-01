/* ---------------------------------------------------------------------- *
 * Console queue data for calendar incidents: the admin approval queue
 * (PENDING_APPROVAL incidents) and the social-media-link triage list.
 * Backend contract: incident/schema/resolvers.py (pendingCalendarIncidents,
 * socialMediaLinks, calendarIncidentCategories — all IsAdmin-gated) and
 * incident/schema/mutations/interactions.py + incidents.py for the writes.
 * ---------------------------------------------------------------------- */

export type CalendarIncidentSeverity = "MAJOR" | "MINOR" | "OTHERS";
export type ChronologyIndicator = "GREEN" | "RED" | "BLUE" | "GRAY";

/** Fetches the same field set as the public `INSIDEN_INCIDENTS_QUERY` (plus `created`) so a
 *  pending row can be passed straight into `IncidentCardComponent` — the element reused from the
 *  /insiden source page — and so the panel's update mutation can echo the full incident state
 *  back (the backend `updateCalendarIncident` replaces M2M/chronology rows verbatim, so omitting
 *  any of these strips them). */
export const PENDING_INCIDENTS_QUERY = /* GraphQL */ `
  query PendingIncidents($search: String) {
    pendingCalendarIncidents(search: $search) {
      id
      title
      brief
      details
      severity
      startDatetime
      endDatetime
      created
      lastUpdated
      hasDetails
      impactFactor
      longTerm
      inaccurate
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
      categories {
        id
        name
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

export interface PendingIncidentChronology {
  order: number;
  indicator: ChronologyIndicator;
  datetime: string;
  content: string;
  sourceUrl: string | null;
}

export interface PendingIncident {
  id: string;
  title: string;
  brief: string;
  details: string;
  severity: CalendarIncidentSeverity;
  startDatetime: string;
  endDatetime: string | null;
  created: string;
  lastUpdated: string;
  hasDetails: boolean;
  impactFactor: number;
  longTerm: boolean;
  inaccurate: boolean;
  lines: { id: string; code: string; displayName: string }[];
  vehicles: { id: string; identificationNo: string }[];
  stations: { id: string; displayName: string }[];
  categories: { id: string; name: string }[];
  chronologies: PendingIncidentChronology[];
  voteScore: number;
  voteBreakdown: { upvotes: number; downvotes: number };
  /** 1 upvoted, -1 downvoted, 0 no vote (matches VoteButtonComponent's VoteValue). */
  userVote: -1 | 0 | 1;
  medias: { file: { url: string }; width: number; height: number }[];
}

export interface PendingIncidentsQueryData {
  pendingCalendarIncidents: PendingIncident[];
}

export interface PendingIncidentsQueryVars {
  search?: string;
}

export const APPROVE_INCIDENT_MUTATION = /* GraphQL */ `
  mutation ApproveIncident($incidentId: ID!) {
    approveCalendarIncident(calendarIncidentId: $incidentId) {
      ok
    }
  }
`;

export interface ApproveIncidentVars {
  incidentId: string;
}

export const REJECT_INCIDENT_MUTATION = /* GraphQL */ `
  mutation RejectIncident($incidentId: ID!, $reason: String!) {
    rejectCalendarIncident(calendarIncidentId: $incidentId, reason: $reason) {
      ok
    }
  }
`;

export interface RejectIncidentVars {
  incidentId: string;
  reason: string;
}

export interface IncidentMutationData {
  approveCalendarIncident?: { ok: boolean };
  rejectCalendarIncident?: { ok: boolean };
}

/** Admin quick-edit from the row panel. The backend replaces lines/vehicles/stations/categories
 *  and chronologies from the input verbatim, so every fetched field must be echoed back. */
export const UPDATE_CALENDAR_INCIDENT_MUTATION = /* GraphQL */ `
  mutation UpdateCalendarIncident($calendarIncidentId: ID!, $input: CalendarIncidentInput!) {
    updateCalendarIncident(calendarIncidentId: $calendarIncidentId, input: $input) {
      ok
    }
  }
`;

export interface UpdateCalendarIncidentVars {
  calendarIncidentId: string;
  input: {
    title: string;
    brief: string;
    startDatetime: string;
    severity: CalendarIncidentSeverity;
    endDatetime?: string | null;
    longTerm?: boolean | null;
    inaccurate?: boolean | null;
    impactFactor?: number | null;
    details?: string | null;
    lineIds?: string[];
    vehicleIds?: string[];
    stationIds?: string[];
    categoryIds?: string[];
    chronologies?: {
      indicator: ChronologyIndicator;
      datetime?: string | null;
      sourceUrl?: string | null;
      content?: string | null;
    }[];
  };
}

export interface UpdateCalendarIncidentData {
  updateCalendarIncident: { ok: boolean };
}

export const SOCIAL_MEDIA_LINKS_QUERY = /* GraphQL */ `
  query ConsoleSocialMediaLinks($search: String, $categoryId: ID, $completed: Boolean) {
    socialMediaLinks(search: $search, categoryId: $categoryId, completed: $completed) {
      id
      url
      title
      created
      completed
      completedAt
      user {
        nickname
        shortId
      }
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
      categories {
        id
        name
      }
    }
  }
`;

export interface SocialMediaLinkRow {
  id: string;
  url: string;
  title: string;
  created: string;
  completed: boolean;
  completedAt: string | null;
  user: { nickname: string; shortId: string } | null;
  lines: { id: string; code: string; displayName: string }[];
  vehicles: { id: string; identificationNo: string }[];
  stations: { id: string; displayName: string }[];
  categories: { id: string; name: string }[];
}

export interface SocialMediaLinksQueryData {
  socialMediaLinks: SocialMediaLinkRow[];
}

export interface SocialMediaLinksQueryVars {
  search?: string;
  categoryId?: string;
  completed?: boolean;
}

export const MARK_LINK_COMPLETED_MUTATION = /* GraphQL */ `
  mutation MarkLinkCompleted($linkId: ID!) {
    markSocialMediaLinkCompleted(socialMediaLinkId: $linkId) {
      ok
    }
  }
`;

export interface MarkLinkCompletedVars {
  linkId: string;
}

export interface MarkLinkCompletedData {
  markSocialMediaLinkCompleted: { ok: boolean };
}

/** Admin full edit from the row panel — the backend replaces lines/vehicles/stations/categories
 *  from the input verbatim (mirrors submitSocialMediaLink's `.set()` semantics), so every
 *  editable field is sent. */
export const UPDATE_SOCIAL_MEDIA_LINK_MUTATION = /* GraphQL */ `
  mutation UpdateSocialMediaLink($socialMediaLinkId: ID!, $input: SocialMediaLinkInput!) {
    updateSocialMediaLink(socialMediaLinkId: $socialMediaLinkId, input: $input) {
      ok
    }
  }
`;

export interface UpdateSocialMediaLinkVars {
  socialMediaLinkId: string;
  input: {
    url: string;
    title?: string | null;
    lineIds?: string[];
    vehicleIds?: string[];
    stationIds?: string[];
    categoryIds?: string[];
  };
}

export interface UpdateSocialMediaLinkData {
  updateSocialMediaLink: { ok: boolean };
}

export const CONSOLE_CATEGORIES_QUERY = /* GraphQL */ `
  query ConsoleCategories {
    calendarIncidentCategories {
      id
      name
    }
  }
`;

export interface ConsoleCategoriesQueryData {
  calendarIncidentCategories: { id: string; name: string }[];
}
