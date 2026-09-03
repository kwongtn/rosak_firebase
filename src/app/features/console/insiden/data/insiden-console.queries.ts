/* ---------------------------------------------------------------------- *
 * Console queue data for calendar incidents: the admin approval queue
 * (PENDING_APPROVAL incidents) and the social-media-link triage list.
 * Backend contract: incident/schema/resolvers.py (pendingCalendarIncidents,
 * socialMediaLinks, calendarIncidentCategories — all IsAdmin-gated) and
 * incident/schema/mutations/interactions.py + incidents.py for the writes.
 * ---------------------------------------------------------------------- */

import type {
  CalendarChronologyStatus,
  CalendarIncidentMedia,
  CalendarIncidentStatus,
} from "../../../insiden/data/insiden.queries";

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
      # Approval lifecycle state (Task 1 scalar backport, same field as the
      # public INSIDEN_INCIDENTS_QUERY): the queue now also carries LIVE
      # incidents with a PENDING_DELETION chronology (spec E1), so the row
      # and the detail panel must distinguish them from PENDING_APPROVAL.
      status
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
        id
        order
        indicator
        datetime
        content
        sourceUrl
        status
        voteScore
        voteBreakdown {
          upvotes
          downvotes
        }
        userVote
      }
      voteScore
      voteBreakdown {
        upvotes
        downvotes
      }
      userVote
      # Same additive fields as the public query (Task 19): the embedded card's photo grid
      # needs id + uploader.nickname to open the gallery MediaViewerComponent in-page.
      medias {
        id
        file {
          url
        }
        width
        height
        uploader {
          nickname
        }
      }
    }
  }
`;

export interface PendingIncidentChronology {
  id?: string;
  order: number;
  indicator: ChronologyIndicator;
  datetime: string;
  content: string;
  sourceUrl: string | null;
  /** Same optional-vote/status shape as the public CalendarIncidentChronology so a pending
   * row can be passed straight into IncidentCardComponent's chronology timeline (the embedded
   * card then renders status tags + vote buttons for admins too). Absent → untagged/no votes. */
  status?: CalendarChronologyStatus;
  voteScore?: number;
  voteBreakdown?: { upvotes: number; downvotes: number };
  userVote?: -1 | 0 | 1;
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
  /** Approval lifecycle (Task 1): "PENDING_APPROVAL" for queue rows awaiting admin approval,
   * "LIVE" for the spec-E1 deletion-review rows (a LIVE incident with a PENDING_DELETION
   * chronology). Optional on older payloads — treat as PENDING_APPROVAL. */
  status?: CalendarIncidentStatus;
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
  medias: CalendarIncidentMedia[];
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

/** Single source of truth for the incident edit mutation — re-exported from the public
 *  insiden queries so public-edit (Task 11) and console-edit never carry divergent copies.
 *  Backend semantics: admin → in-place for non-DRAFT (Option A); user → DRAFT revision. */
export { UPDATE_CALENDAR_INCIDENT_MUTATION } from "../../../insiden/data/insiden.queries";
export type {
  UpdateCalendarIncidentData,
  UpdateCalendarIncidentVars,
} from "../../../insiden/data/insiden.queries";

export const SOCIAL_MEDIA_LINKS_QUERY = /* GraphQL */ `
  query ConsoleSocialMediaLinks(
    $search: String
    $categoryId: ID
    $completed: Boolean
    $lineId: ID
    $vehicleId: ID
    $stationId: ID
    $createdAfter: DateTime
    $createdBefore: DateTime
  ) {
    socialMediaLinks(
      search: $search
      categoryId: $categoryId
      completed: $completed
      lineId: $lineId
      vehicleId: $vehicleId
      stationId: $stationId
      createdAfter: $createdAfter
      createdBefore: $createdBefore
    ) {
      id
      url
      title
      created
      completed
      completedAt
      # Completing admin (Task 1): the admin user who marked the link completed;
      # null when it was never completed.
      completedBy
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
  /** Display name of the completing admin (nickname or shortId), null until completed. */
  completedBy: string | null;
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
  lineId?: string;
  vehicleId?: string;
  stationId?: string;
  /** ISO datetimes for the backend's createdAfter/createdBefore range — omit for unbounded. */
  createdAfter?: string;
  createdBefore?: string;
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

/* ---------------------------------------------------------------------- *
 * Chronology deletion review (Task 6 backend mutations — spec E1). The
 * request flow is LIVE-only: a user (or admin) flags a LIVE chronology via
 * requestChronologyDeletion, the incident then surfaces in this queue, and
 * an admin either approves (soft-deletes the chronology) or rejects (reverts
 * it to LIVE). Both mutations are IsAdmin-gated. Single key: chronologyId.
 * ---------------------------------------------------------------------- */

export const APPROVE_CHRONOLOGY_DELETION_MUTATION = /* GraphQL */ `
  mutation ApproveChronologyDeletion($chronologyId: ID!) {
    approveChronologyDeletion(chronologyId: $chronologyId) {
      ok
    }
  }
`;

export const REJECT_CHRONOLOGY_DELETION_MUTATION = /* GraphQL */ `
  mutation RejectChronologyDeletion($chronologyId: ID!) {
    rejectChronologyDeletion(chronologyId: $chronologyId) {
      ok
    }
  }
`;

export interface ChronologyDeletionDecisionVars {
  chronologyId: string;
}

export interface ChronologyDeletionDecisionData {
  approveChronologyDeletion?: { ok: boolean };
  rejectChronologyDeletion?: { ok: boolean };
}
