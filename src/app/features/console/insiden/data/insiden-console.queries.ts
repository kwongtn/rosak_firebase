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
/* The approval-status union is declared once, in the feed queries that also own
 * the `status` argument — the console reads the same values, so it imports the
 * type rather than cloning a second union. */
import type { SocialMediaLinkStatus } from "../../../home/data/home.queries";

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

/** The admin link-triage queue.
 *
 *  Ordering is `-occurredAt, -id` — "what happened most recently", keyed on the event instant,
 *  not the submission time. Consequently the date-range arguments were RENAMED `createdAfter` /
 *  `createdBefore` → `occurredAfter` / `occurredBefore` (verified against the deployed schema:
 *  `socialMediaLinks(search: String, ..., occurredAfter: DateTime, occurredBefore: DateTime)`).
 *  The rename is deliberate and has NO alias: the old names filtered on `created` while the page
 *  sorted by `occurredAt`, so an alias would have kept a date filter silently answering a
 *  different question than the rows above it. A stale `createdAfter` is a hard validation error
 *  ("Unknown argument"), which is the intended failure mode — loud, not silently wrong.
 *
 *  `threadLinks` is deliberately NOT selected: the queue renders a flat moderation table where
 *  a thread shows as a `Thread (N)` chip, and the count already answers "how many members does
 *  this row hide?". Selecting the members would let a HIDDEN row's URL/title travel inside a
 *  nested field of an admin-gated query for no rendering benefit. */
export const SOCIAL_MEDIA_LINKS_QUERY = /* GraphQL */ `
  query ConsoleSocialMediaLinks(
    $search: String
    $categoryId: ID
    $completed: Boolean
    $lineId: ID
    $vehicleId: ID
    $stationId: ID
    $occurredAfter: DateTime
    $occurredBefore: DateTime
  ) {
    socialMediaLinks(
      search: $search
      categoryId: $categoryId
      completed: $completed
      lineId: $lineId
      vehicleId: $vehicleId
      stationId: $stationId
      occurredAfter: $occurredAfter
      occurredBefore: $occurredBefore
    ) {
      id
      url
      title
      created
      # "When did this happen" — the column the queue sorts on and the instant the
      # range filter windows over. Kept next to created deliberately: an admin
      # moderates against the submission time, so the row must be able to show
      # both. Naive local wall time (backend USE_TZ = False), no offset.
      occurredAt
      # Thread grouping, for the row's "Thread (N)" chip and its Ungroup action.
      # threadSize counts only publicly-visible members, which is exactly what an
      # admin needs: the gap between the chip and the raw member count is the
      # hidden members, and that coupling (thread public iff root public) is
      # invisible otherwise.
      threadId
      isThreadRoot
      threadSize
      completed
      completedAt
      # Completing admin (Task 1): the admin user who marked the link completed;
      # null when it was never completed.
      completedBy
      # Approval lifecycle (independent of the completed/handled flag above):
      # the row's Approve action is offered only while this isn't LIVE.
      status
      # Provenance: true only for rows written by the official-post ingestion,
      # so the row can badge an automatically captured operator post instead of
      # leaving an admin to infer it from the submitter.
      isAutomated
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
  /** "When did this happen" — the instant the row is sorted and range-filtered on
   *  (`-occurredAt, -id`). NOT NULL on the backend, so a present value is always real;
   *  naive local wall time, no offset (backend `USE_TZ = False`). Distinct from
   *  `created`, which stays the "when did someone report it" moderation column —
   *  an admin moderates against `created` and reads `occurredAt` as a claim.
   *
   *  RE-SENT VERBATIM by linkStatusInput: `SocialMediaLinkInput` is
   *  replace-not-patch, and `occurredAt` has a third tri-state (explicit `null`
   *  resets the row to its submission time), so an editor that coerces this to
   *  `?? null` would silently rewrite the event time of every approved row. */
  occurredAt: string;
  /** Id of the thread root this row belongs to; `null` exactly when this row IS a
   *  root (which includes every ordinary unthreaded row). */
  threadId: string | null;
  /** True for thread roots — gates the row's "Thread (N)" chip and Ungroup action. */
  isThreadRoot: boolean;
  /** `1 + count(publicly-visible members)` — the chip's number. `1` when unthreaded;
   *  it counts only publicly-visible members, so the gap against the raw member
   *  count is exactly the hidden ones (a thread is public iff its ROOT is). */
  threadSize: number;
  completed: boolean;
  completedAt: string | null;
  /** Display name of the completing admin (nickname or shortId), null until completed. */
  completedBy: string | null;
  /** Approval lifecycle — `PENDING_APPROVAL` for a community submission (or an
   *  auto-ingested post) awaiting an admin, `LIVE` once published, `HIDDEN` when an
   *  admin removed it from the feed. Distinct from `completed`, the queue's own
   *  "mark handled" flag. */
  status: SocialMediaLinkStatus;
  /** True for rows written by the official-post ingestion (backend `is_automated`) —
   *  drives the row's "Official" chip. False for every hand-submitted link. */
  isAutomated: boolean;
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
  /** ISO datetimes bounding `occurredAt` — the same column the result is ordered by, so the
   *  filter and the sort can never disagree. Omit for unbounded.
   *
   *  ⚠️ Renamed from `createdAfter`/`createdBefore` on purpose, with no alias. The queue now
   *  orders `-occurredAt, -id`, so filtering on `created` would show a page sorted by one
   *  instant and windowed by another — a backdated report would appear at the top of a day
   *  range that excludes it. The backend arguments carry the same new names, so a stale
   *  spelling fails loudly ("Unknown argument") instead of quietly returning the wrong rows. */
  occurredAfter?: string;
  occurredBefore?: string;
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

export const DELETE_SOCIAL_MEDIA_LINK_MUTATION = /* GraphQL */ `
  mutation DeleteSocialMediaLink($linkId: ID!) {
    deleteSocialMediaLink(socialMediaLinkId: $linkId) {
      ok
    }
  }
`;

export interface DeleteSocialMediaLinkVars {
  linkId: string;
}

export interface DeleteSocialMediaLinkData {
  deleteSocialMediaLink: { ok: boolean };
}

/** Single source of truth for the link edit mutation — re-exported from the public insiden
 * queries so public-edit and console-edit never carry divergent copies. Backend role rule:
 * admin edits land live; a submitter's edit goes back into the approval queue
 * (update_social_media_link in incident/services/social_links.py). */
export { UPDATE_SOCIAL_MEDIA_LINK_MUTATION } from "../../../insiden/data/social-links.queries";
export type {
  UpdateSocialMediaLinkData,
  UpdateSocialMediaLinkVars,
} from "../../../insiden/data/social-links.queries";

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
