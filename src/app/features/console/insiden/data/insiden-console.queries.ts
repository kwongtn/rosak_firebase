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
 *  `sublinks` is deliberately NOT selected: the queue's hierarchy column and its
 *  depth indentation are built from the FLAT row set this query already returns (every
 *  link is a row in one admin-gated list, ordered `occurredAt DESC, id DESC`), so nesting
 *  the same links under their parents would duplicate them in the payload and let a HIDDEN
 *  row's URL/title travel inside a nested field for no rendering benefit. `parentId` +
 *  `isThreadRoot` + `sublinkCount` are the whole hierarchy the table needs, and they are
 *  cheap scalars.
 *
 *  🔴 THE ORDERING RULE FOR A SIBLING RUN, which this document selects `position` for:
 *  `reorderSocialMediaLinks` is a PERMUTATION of one existing sibling set — it does not
 *  move anything, it rewrites the whole run's stored positions from the list it is given.
 *  So a client must send the run in the STORED order (the one `position` describes) with
 *  the one intended move applied, and it MUST NOT send the order this table happens to
 *  render. The table's own order is `occurredAt DESC, id DESC`; the stored order is
 *  `position ASC`. They are different orderings, and sending the table's order writes the
 *  table's order as the conversation's sequence — a conversation the backend assembled
 *  oldest-first then comes back reversed, and the reorder round-trips nothing.
 *  Build the payload as: filter the rows by `parentId` (roots are the `null` run), sort by
 *  `position` ASC, then `id` as the tie-break, then apply the single move.
 *
 *  ⚠️ WHY `id` IS NOT OPTIONAL AFTER `position`: `position` is gap-spaced (`10, 20, 30, …`)
 *  and the service renumbers a run to exactly that series on every structural write — but
 *  UNGROUPING deliberately does not renumber the promoted links (backend
 *  `_ungroup_sync`: "inventing a root order nobody asked for is a presentation change
 *  disguised as a repair"), so a promoted link keeps the number it held under its old
 *  parent and can TIE with a root that already holds it. A root's `parentId` is `null`, so
 *  every root is a sibling of every other root, and a run of roots is exactly where a
 *  collision can be seen. `ORDER BY position` alone is then non-deterministic, so `id` is
 *  the tie-break. Never treat `position` as a unique key and never sort a run on it alone.
 */
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
      # The conversation hierarchy, all four selected by this query and all four
      # REQUIRED on the row type — read the four docstrings for why each one is
      # needed. parentId is the depth/parent signal (null = root, which is also
      # every ordinary ungrouped row); sublinkCount is the row's OWN
      # publicly-visible descendant count at any depth and is what the "N links"
      # chip reads — NOT the size of the conversation (read the ROOT's row for that,
      # and never sum a column of them). isThreadRoot is a ROOT MARKER, true for
      # every ungrouped row, so it is valid for "render me as a head" and invalid for
      # "does this row expand". position is the STORED SIBLING SEQUENCE and the reason
      # this document selects it: a reorder permutation must be built from the stored
      # order, not from the order this table renders. See the query's doc comment for
      # the full rule and the tie-break.
      parentId
      isThreadRoot
      sublinkCount
      # The sibling sequence, ASC. NOT this list's order (occurredAt DESC, id DESC),
      # and not unique — see the doc comment.
      position
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
  /* ---- Conversation hierarchy ------------------------------------------- *
   * `parentId`/`isThreadRoot`/`sublinkCount`/`position` are all REQUIRED, because
   * `SOCIAL_MEDIA_LINKS_QUERY` selects all four and
   * `strict`/`strictNullChecks` are OFF — an optional field here would be a hole the
   * compiler could not report and the table would have to `?? 0` its way past. Unlike
   * the public `PublicSocialMediaLink`, this type is the node of exactly ONE document
   * (the incident card's narrow `links(first: 10)` sub-select does not use it), so there
   * is no narrower host whose selection these fields could fail to satisfy. That WAS
   * the stated reason `position` was the odd one out; it no longer is — it was optional
   * only because two console row factories built a row by spreading
   * `Partial<SocialMediaLinkRow>` into an object literal (which widens every property
   * to `T[k] | undefined`), and both now set it. */
  /** Id of the link this row hangs under; `null` exactly when this row IS a root (which
   *  includes every ordinary ungrouped row). Drives the table's depth indentation, and is
   *  the `parentId` both a group-under action and a `reorderSocialMediaLinks` call send. */
  parentId: string | null;
  /** True for roots — a ROOT MARKER, not a "has sublinks" marker: it is true for every
   *  ungrouped row in the queue too, so the only correct "does this row expand" test is
   *  `sublinkCount > 0`. */
  isThreadRoot: boolean;
  /** This row's OWN publicly-visible descendant count, at any depth; `0` for a leaf. The
   *  "N links" chip's number, and NOT the size of the conversation — the root's row holds
   *  that, and summing a column of these double-counts by exactly the depth.
   *
   *  Publicly-visible only, which is exactly what an admin needs: the gap between this
   *  chip and the raw child count is the hidden (or unapproved) descendants, and that
   *  coupling (a conversation is public iff its ROOT is) is invisible otherwise. */
  sublinkCount: number;
  /** This row's stored SIBLING SEQUENCE, gap-spaced `10, 20, 30, …` and ASC-ordered
   *  WITHIN ONE PARENT. NOT this table's order (`occurredAt DESC, id DESC`) and not the
   *  conversation's size — a reordering surface reads it to build the payload for
   *  `reorderSocialMediaLinks`, which permutes one sibling set from the stored order and
   *  cannot recover it from the display order.
   *
   *  🔴 NOT UNIQUE, and a collision is possible in the one run where it matters: the
   *  service renumbers a run to the exact `10, 20, 30, …` series on every structural
   *  write, EXCEPT ungrouping, which promotes links to roots without renumbering them, so
   *  a promoted link can keep the number it held under its old parent. A root's `parentId`
   *  is `null`, so every root is a sibling of every other root — sort a root run by
   *  `position` and then `id`, never by `position` alone.
   *
   *  ⚠️ REQUIRED HERE even though `PublicSocialMediaLink.position` is optional, and
   *  that asymmetry is real rather than an inconsistency: the public type is ALSO the
   *  node of the narrow `links(first: 10)` sub-select in `INSIDEN_INCIDENTS_QUERY`,
   *  which selects a handful of fields and no conversation field at all, so a required
   *  `position` there would be a lie `strictNullChecks` (off) would not catch. This
   *  type has one host document and that document selects the field.
   *
   *  ⚠️ REQUIRED IS NOT "ALWAYS PRESENT AT RUNTIME". `strictNullChecks` is off, so a
   *  payload that omitted the key still type-checks everywhere, and a consumer must
   *  not sort a run without checking: an absent value means the STORED ORDER IS
   *  UNKNOWN, and the sequence write is a permutation, so a synthesised order is
   *  written back as the new stored truth. `links.component.ts::runOrderIsKnown`
   *  refuses instead — read that method before changing anything here. */
  position: number;
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
