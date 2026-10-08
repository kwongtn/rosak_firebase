import type { SocialMediaLinksQueryVars } from "../data/insiden-console.queries";
import { dateInputToIsoEnd, dateInputToIsoStart } from "../data/date-range.util";

export type CompletedFilter = "any" | "pending" | "completed";

export const COMPLETED_LABEL: Record<CompletedFilter, string> = {
  any: "All",
  pending: "Pending",
  completed: "Completed",
};

/** The FEED-VISIBILITY axis, independent of `completed`: "all" omits the `hidden`
 *  query var, "visible" excludes HIDDEN rows and "hidden" returns only them. */
export type VisibilityFilter = "all" | "visible" | "hidden";

export const VISIBILITY_LABEL: Record<VisibilityFilter, string> = {
  all: "All links",
  visible: "Visible only",
  hidden: "Hidden only",
};

/** The APPLIED filter snapshot the queue's query is built from — the plain fields
 *  the component writes when a control commits, NOT the live signals (a dial
 *  changes up to a trailing debounce before any refetch). */
export interface AppliedQueueFilters {
  search?: string;
  categoryId: string;
  completed: CompletedFilter;
  visibility: VisibilityFilter;
  lineId?: string;
  vehicleId?: string;
  stationId?: string;
  dateFrom?: string;
  dateTo?: string;
}

/** Does the APPLIED filter snapshot describe the WHOLE table?
 *
 *  Every axis counts, including the status select and the visibility select —
 *  `completed: false` (the queue's default) already hides every completed row and
 *  `visibility: "visible"` hides every hidden one, so "no search and no date range"
 *  is not enough to prove a complete sibling set. The console resolver has no
 *  pagination and no row cap, so an unfiltered result really is every link there is. */
export function appliedFiltersAreUnfiltered(applied: AppliedQueueFilters): boolean {
  return (
    !applied.search &&
    !applied.categoryId &&
    applied.completed === "any" &&
    applied.visibility === "all" &&
    !applied.lineId &&
    !applied.vehicleId &&
    !applied.stationId &&
    !applied.dateFrom &&
    !applied.dateTo
  );
}

/** Build the GraphQL variables for one applied snapshot.
 *
 *  Filter args are optional server-side (strawberry.Maybe) — omit unset keys
 *  entirely so the wire never carries explicit nulls. The window bounds
 *  `occurredAt` — the same column the result is ordered by — so the filter and the
 *  sort can never answer different questions. (Backend args renamed
 *  createdAfter/createdBefore -> occurredAfter/occurredBefore along with the
 *  ordering change; no alias on purpose.) */
export function queueQueryVars(applied: AppliedQueueFilters): SocialMediaLinksQueryVars {
  const vars: SocialMediaLinksQueryVars = {
    search: applied.search,
    categoryId: applied.categoryId || undefined,
    completed: applied.completed === "any" ? undefined : applied.completed === "completed",
  };
  if (applied.visibility !== "all") {
    vars.hidden = applied.visibility === "hidden";
  }
  if (applied.lineId) {
    vars.lineId = applied.lineId;
  }
  if (applied.vehicleId) {
    vars.vehicleId = applied.vehicleId;
  }
  if (applied.stationId) {
    vars.stationId = applied.stationId;
  }
  const occurredAfter = dateInputToIsoStart(applied.dateFrom ?? "");
  if (occurredAfter) {
    vars.occurredAfter = occurredAfter;
  }
  const occurredBefore = dateInputToIsoEnd(applied.dateTo ?? "");
  if (occurredBefore) {
    vars.occurredBefore = occurredBefore;
  }
  return vars;
}
