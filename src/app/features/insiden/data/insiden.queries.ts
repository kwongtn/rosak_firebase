export type CalendarIncidentSeverity = "MAJOR" | "MINOR" | "OTHERS";
export type ChronologyIndicator = "GREEN" | "RED" | "BLUE" | "GRAY";

import type { PublicSocialMediaLink } from "./social-links.queries";

/** Approval lifecycle of a calendar incident (backend `CalendarIncidentStatus` TextChoices:
 * `draft`, `pending_approval`, `live`, `rejected`). Both the stored (lowercase) and the GraphQL
 * enum (SCREAMING_SNAKE) casings are represented — TextChoicesField fields serialize as an enum
 * on the wire, but older payloads can carry the raw stored value. */
export type CalendarIncidentStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "LIVE"
  | "REJECTED"
  | "draft"
  | "pending_approval"
  | "live"
  | "rejected";

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
      # Approval lifecycle state. DEPLOY ORDER: the backend change (expose
      # 'status: strawberry.auto' on CalendarIncidentScalar — the model already has
      # CalendarIncident.status TextChoicesField; same backport pattern as the 'created'
      # field commit cdcb6e8) MUST land before this query ships: GraphQL fails the whole
      # operation on an unknown field, which would take /insiden down. Until the backend
      # exposes it, calendarIncidents has NO status filter, so DRAFT/PENDING_APPROVAL rows
      # are already in the payload — once 'status' arrives the card highlights them.
      status
      # Optimistic concurrency token (Task 1): echo this back in updateCalendarIncident's
      # "version" input so a concurrent editor gets "Version mismatch..." instead of a silent
      # overwrite. DEPLOY ORDER: backend task 1 (version on CalendarIncidentScalar) has
      # landed — this field is additive-only.
      version
      lastUpdated
      # Author identity (Task 12): 'user' is CalendarIncidentScalar's created_by, exposed as
      # the public UserScalar (shortId is public; firebaseId is admin-gated — never request
      # it). Null for legacy rows. DEPLOY ORDER: backend Task 12 landed first — additive-only.
      user {
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
      # Same scalar as the console queue: the backend exposes categories on
      # CalendarIncidentScalar, so the public feed can pre-fill the form's
      # Categories multi-select for edits. DEPLOY ORDER: additive-only; the
      # backend field has shipped (console has used it for a while).
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
        # Approval lifecycle + vote fields of a single chronology row (Task 13):
        # "status" drives the Pending Approval/Pending Deletion tag on the card's
        # timeline, and the vote fields feed the per-chronology vote buttons
        # (Task 8 mutations). DEPLOY ORDER: backend Tasks 1/8 landed first —
        # additive-only.
        status
        voteScore
        voteBreakdown {
          upvotes
          downvotes
        }
        userVote
      }
      # Per-incident submitted links, first page inline (Task 15). The nested
      # field returns the SocialMediaLinkConnection — same keyset cursor +
      # ordering (created DESC, id DESC) as the root publicSocialMediaLinks
      # query, so the card's continuation pages simply call
      # publicSocialMediaLinks(incidentId, first, after) with this page's
      # endCursor. DEPLOY ORDER: backend CalendarIncidentScalar.links landed
      # first (Task 15 — additive-only).
      links(first: 10) {
        edges {
          node {
            id
            url
            title
            created
            status
            completed
          }
          cursor
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
      voteScore
      voteBreakdown {
        upvotes
        downvotes
      }
      userVote
      # Incident photo thumbnails (Task 19): id + uploader.nickname come from the shared
      # backend MediaScalar (additive-only, no schema change) and feed the in-page preview —
      # MediaViewerComponent (gallery feature) renders uploader info and needs a stable key.
      # It exposes no created-date field (that lives only on the gallery's MediaType), so the
      # card's viewer shows the photo without an "Uploaded on" value — see
      # incident-media-viewer.util.ts.
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

/** Approval lifecycle of a single chronology row (backend
 * `CalendarIncidentChronology.status` TextChoices: `draft`, `pending_approval`, `live`,
 * `pending_deletion`). Both the stored (lowercase) and the GraphQL enum (SCREAMING_SNAKE)
 * casings are represented, same dual-casing contract as `CalendarIncidentStatus`. */
export type CalendarChronologyStatus =
  | "LIVE"
  | "PENDING_APPROVAL"
  | "PENDING_DELETION"
  | "DRAFT"
  | "live"
  | "pending_approval"
  | "pending_deletion"
  | "draft";

export interface CalendarIncidentChronology {
  /** Backend row id — the value VoteButtonComponent sends as `chronologyId`. Absent
   * only on frontend-synthesized entries (default timeline / "Ongoing" tail). */
  id?: string;
  order: number;
  indicator: ChronologyIndicator;
  datetime: string;
  content: string;
  sourceUrl: string | null;
  /** Approval lifecycle; absent on synthesized entries and older payloads → the card
   * renders no status tag (see chronology-status.util). */
  status?: CalendarChronologyStatus;
  voteScore?: number;
  voteBreakdown?: { upvotes: number; downvotes: number };
  /** 1 upvoted, -1 downvoted, 0 no vote (matches VoteButtonComponent's VoteValue). */
  userVote?: -1 | 0 | 1;
}

export interface CalendarIncidentMedia {
  /** Shared backend MediaScalar id — the reference key for the card's photo grid and the
   * gallery MediaViewerComponent (which requires MediaNode.id). Always present once the
   * query below requests it. */
  id: string;
  file: { url: string };
  width: number;
  height: number;
  /** Public uploader identity (UserScalar.nickname); nullable on old rows that predate
   * uploader linkage — the viewer map falls back to an empty nickname. */
  uploader?: { nickname: string } | null;
}

/** Per-incident link connection (Task 15/16): first page arrives inline with the
 * incident; continuation pages go through the root publicSocialMediaLinks query
 * with the same cursor. */
export interface CalendarIncidentLinkEdge {
  node: PublicSocialMediaLink;
  cursor: string;
}
export interface CalendarIncidentLinks {
  edges: CalendarIncidentLinkEdge[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
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
  /** Approval lifecycle state; optional — present only once the backend scalar exposes it.
   * Absent (old backend / older payload) → IncidentCard treats the entry as not pending. */
  status?: CalendarIncidentStatus;
  /** Optimistic concurrency token for edits (Task 1); optional — absent only on older
   * payloads. Echo it back as updateCalendarIncident's `version` input for OCC. */
  version?: number;
  /** Submitting author (Task 12) — `user.shortId` is the public 8-char prefix of the Firebase
   * uid used for the author-side of the edit gate (see can-edit.incident.util). Null for legacy
   * rows (created_by is nullable on the model); optional only on older payloads. */
  user?: { shortId: string } | null;
  lastUpdated: string;
  lines: { id: string; code: string; displayName: string }[];
  vehicles: { id: string; identificationNo: string }[];
  stations: { id: string; displayName: string }[];
  /** Category tags for the form's Categories multi-select (edit prefill); optional for
   * the same grace period as `version` — treat as absent → empty selection. */
  categories?: { id: string; name: string }[];
  chronologies: CalendarIncidentChronology[];
  /** Per-incident link list; optional — fetched only by the public query's links
   * sub-select (the console's pending queue does not request it, so cards there
   * render no link section). The card renders nothing when absent. */
  links?: CalendarIncidentLinks;
  voteScore: number;
  voteBreakdown: { upvotes: number; downvotes: number };
  /** 1 upvoted, -1 downvoted, 0 no vote (matches VoteButtonComponent's VoteValue). */
  userVote: -1 | 0 | 1;
  medias: CalendarIncidentMedia[];
}

export interface InsidenIncidentsQueryData {
  calendarIncidents: CalendarIncident[];
}

/* ---------------------------------------------------------------------- *
 * Per-incident history (Task 18): the card's details area shows only the
 * LATEST entry, fetched lazily on expand with `limit: 1` (the backend is
 * latest-first). IsLoggedIn — the card gates the fetch on `auth.isLoggedIn()`
 * and never fires for collapsed cards.
 * ---------------------------------------------------------------------- */

export const CALENDAR_INCIDENT_HISTORY_QUERY = /* GraphQL */ `
  query CalendarIncidentHistory($id: ID!, $limit: Int = 50) {
    calendarIncidentHistory(id: $id, limit: $limit) {
      timestamp
      actor
      changeType
      changedFields
    }
  }
`;

/** Backend changeType for one history record (django-simple-history history_type
 * `+`/`~`/`-` mapped by the resolver to created/updated/deleted). */
export type CalendarIncidentHistoryChangeType = "created" | "updated" | "deleted";

/** One diffed history record. `changedFields` lists the MODEL field names that
 * changed (diffed against the previous record): ["created"] for the creation
 * record, ["deleted"] for a deletion, otherwise the field names (e.g. ["title"]).
 * See incident-history-line.util.ts for the field-name → label map. */
export interface CalendarIncidentHistoryEntry {
  /** history_date of the record (UTC). */
  timestamp: string;
  /** Display identity of the changing user; null for system/anonymous changes. */
  actor: string | null;
  changeType: CalendarIncidentHistoryChangeType;
  changedFields: string[];
}

export interface CalendarIncidentHistoryData {
  calendarIncidentHistory: CalendarIncidentHistoryEntry[];
}

export interface CalendarIncidentHistoryVars {
  id: string;
  limit?: number;
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

/** IsLoggedIn edit of an existing incident. The backend replaces lines/vehicles/stations/
 *  categories and chronologies from the input verbatim, so the payload must carry the full
 *  edited form state (Task 11). Single source of truth — the console panel re-exports this
 *  from here (see insiden-console.queries.ts) so public-edit and console-edit share one
 *  mutation and never drift.
 *
 *  Backend semantics (incident/services/incidents.py): DRAFT → in-place; non-admin edit of a
 *  non-DRAFT → creates a DRAFT revision (the Task 2 "unapproved edit draft already exists"
 *  error fires when one is already open); admin → in-place for any status (Option A).
 *
 *  `id` is set ONLY when the update created/resumed a DRAFT revision (non-admin editing a
 *  LIVE incident, incl. same-actor draft resume) — chain submitCalendarIncident(id) in that
 *  case. It is null for all in-place paths (admin edits, author-pending edits, DRAFT edits). */
export const UPDATE_CALENDAR_INCIDENT_MUTATION = /* GraphQL */ `
  mutation UpdateCalendarIncident($calendarIncidentId: ID!, $input: CalendarIncidentInput!) {
    updateCalendarIncident(calendarIncidentId: $calendarIncidentId, input: $input) {
      ok
      id
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
    /** OCC: echo the `version` read at hydrate time; mismatch → "Version mismatch…" error
     * (backend raises ConcurrencyConflictError). null omits the check. */
    version?: number | null;
    chronologies?: {
      indicator: ChronologyIndicator;
      datetime?: string | null;
      sourceUrl?: string | null;
      content?: string | null;
    }[];
  };
}

export interface UpdateCalendarIncidentData {
  updateCalendarIncident: { ok: boolean; id: string | null };
}

export const UPVOTE_MUTATION = /* GraphQL */ `
  mutation Upvote($incidentId: ID!) {
    upvote(calendarIncidentId: $incidentId) {
      ok
    }
  }
`;

export const DOWNVOTE_MUTATION = /* GraphQL */ `
  mutation Downvote($incidentId: ID!) {
    downvote(calendarIncidentId: $incidentId) {
      ok
    }
  }
`;

export const REMOVE_VOTE_MUTATION = /* GraphQL */ `
  mutation RemoveVote($incidentId: ID!) {
    removeVote(calendarIncidentId: $incidentId) {
      ok
    }
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

/* ---------------------------------------------------------------------- *
 * Per-chronology votes (Task 8): same semantics as the incident mutations —
 * IsLoggedIn, idempotent update_or_create on switch, remove clears the vote —
 * but scoped to a single chronology row, whose id comes from the
 * `chronologies { id }` sub-select. VoteButtonComponent picks these when its
 * `targetType` input is "chronology".
 * ---------------------------------------------------------------------- */

export const UPVOTE_CHRONOLOGY_MUTATION = /* GraphQL */ `
  mutation UpvoteChronology($chronologyId: ID!) {
    upvoteChronology(chronologyId: $chronologyId) {
      ok
    }
  }
`;

export const DOWNVOTE_CHRONOLOGY_MUTATION = /* GraphQL */ `
  mutation DownvoteChronology($chronologyId: ID!) {
    downvoteChronology(chronologyId: $chronologyId) {
      ok
    }
  }
`;

export const REMOVE_CHRONOLOGY_VOTE_MUTATION = /* GraphQL */ `
  mutation RemoveChronologyVote($chronologyId: ID!) {
    removeChronologyVote(chronologyId: $chronologyId) {
      ok
    }
  }
`;

export interface ChronologyVoteMutationData {
  upvoteChronology?: { ok: boolean };
  downvoteChronology?: { ok: boolean };
  removeChronologyVote?: { ok: boolean };
}

export interface ChronologyVoteMutationVars {
  chronologyId: string;
}

/* ---------------------------------------------------------------------- *
 * Chronology mark-for-delete (Task 6 backend — spec E1): the author of a
 * LIVE chronology (or an admin) flags it for deletion; an admin then
 * approves (soft delete) or rejects (revert to LIVE) it through the console
 * queue. Backend permission: IsLoggedIn + author-or-admin + chronology must
 * be LIVE. DEPLOY ORDER: backend Task 6 landed first — additive-only.
 * ---------------------------------------------------------------------- */

export const REQUEST_CHRONOLOGY_DELETION_MUTATION = /* GraphQL */ `
  mutation RequestChronologyDeletion($chronologyId: ID!) {
    requestChronologyDeletion(chronologyId: $chronologyId) {
      ok
    }
  }
`;

export interface ChronologyDeletionRequestData {
  requestChronologyDeletion: { ok: boolean };
}

export interface ChronologyDeletionRequestVars {
  chronologyId: string;
}

/* ---------------------------------------------------------------------- *
 * Reference data for the report form / link form: lines (with their vehicle
 * rosters) and stations, so users can tag an incident or a submitted link
 * with the assets it affects. Both fields are public on the backend.
 * ---------------------------------------------------------------------- */

export const INSIDEN_REFERENCE_QUERY = /* GraphQL */ `
  query InsidenReferenceData {
    lines {
      id
      code
      displayName
      vehicleTypes {
        id
        displayName
        vehicles {
          id
          identificationNo
        }
      }
    }
    stations {
      id
      displayName
      lines {
        id
        code
      }
    }
    calendarIncidentCategories {
      id
      name
    }
  }
`;

export interface InsidenReferenceLine {
  id: string;
  code: string;
  displayName: string;
  vehicleTypes: {
    id: string;
    displayName: string;
    vehicles: { id: string; identificationNo: string }[];
  }[];
}

export interface InsidenReferenceStation {
  id: string;
  displayName: string;
  lines: { id: string; code: string }[];
}

export interface InsidenReferenceCategory {
  id: string;
  name: string;
}

export interface InsidenReferenceQueryData {
  lines: InsidenReferenceLine[];
  stations: InsidenReferenceStation[];
  calendarIncidentCategories: InsidenReferenceCategory[];
}

export const SUBMIT_SOCIAL_MEDIA_LINK_MUTATION = /* GraphQL */ `
  mutation SubmitSocialMediaLink($input: SocialMediaLinkInput!) {
    submitSocialMediaLink(input: $input) {
      ok
    }
  }
`;

export interface SubmitSocialMediaLinkData {
  submitSocialMediaLink: { ok: boolean };
}

export interface SubmitSocialMediaLinkVars {
  input: {
    url: string;
    title?: string | null;
    categoryIds?: string[];
    lineIds?: string[];
    vehicleIds?: string[];
    stationIds?: string[];
    /** Per-incident targeting (Task 14): maps to backend `SocialMediaLinkInput.incident_id`
     * (strawberry.Maybe[ID | None]). Send the incident's id as a string; OMIT the key for
     * the just-dumping flow — never send `incidentId: null` explicitly (UNSET vs None is
     * meaningful server-side). */
    incidentId?: string;
  };
}
