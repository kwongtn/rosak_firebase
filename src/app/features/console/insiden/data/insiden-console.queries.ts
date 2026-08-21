/* ---------------------------------------------------------------------- *
 * Console queue data for calendar incidents: the admin approval queue
 * (PENDING_APPROVAL incidents) and the social-media-link triage list.
 * Backend contract: incident/schema/resolvers.py (pendingCalendarIncidents,
 * socialMediaLinks, calendarIncidentCategories — all IsAdmin-gated) and
 * incident/schema/mutations/interactions.py + incidents.py for the writes.
 * ---------------------------------------------------------------------- */

export type CalendarIncidentSeverity = "MAJOR" | "MINOR" | "OTHERS";
export type ChronologyIndicator = "GREEN" | "RED" | "BLUE" | "GRAY";

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
      lines {
        code
        displayName
      }
      chronologies {
        indicator
        content
        sourceUrl
      }
    }
  }
`;

export interface PendingIncidentChronology {
  indicator: ChronologyIndicator;
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
  lines: { code: string; displayName: string }[];
  chronologies: PendingIncidentChronology[];
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
      categories {
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
  categories: { name: string }[];
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
