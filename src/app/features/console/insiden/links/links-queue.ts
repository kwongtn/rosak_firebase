import { inject, signal } from "@angular/core";
import { AuthService } from "../../../../core/auth/auth.service";
import { GraphQLClient } from "../../../../core/graphql/graphql-client";
import { ToastService } from "../../../../ui/toast/toast.service";
import {
  SOCIAL_MEDIA_LINKS_QUERY,
  type SocialMediaLinkRow,
  type SocialMediaLinksQueryData,
  type SocialMediaLinksQueryVars,
} from "../data/insiden-console.queries";
import {
  SEARCH_DEBOUNCE_MS,
  createTrailingDebounce,
  searchTermOrUndefined,
} from "../data/search-debounce.util";
import {
  appliedFiltersAreUnfiltered,
  queueQueryVars,
  type AppliedQueueFilters,
  type CompletedFilter,
  type VisibilityFilter,
} from "./link-queue-filter.util";

/**
 * The /console/links queue's data layer: the loaded rows, the filter controls and the snapshot
 * they apply, and the loading flag every verb shares, with `load()`'s park-and-replay and the one
 * place the flag drops (`finishLoading`). Every write verb holds the flag through `isLoading`,
 * refetches through `fetchLinks` and releases it through `finishLoading`. Call in an injection
 * context.
 */
export function injectLinksQueue() {
  const graphql = inject(GraphQLClient);
  const auth = inject(AuthService);
  const toast = inject(ToastService);
  /** One trailing debounce serves search AND the filter controls — last change wins. */
  const queueDebouncer = createTrailingDebounce(SEARCH_DEBOUNCE_MS);

  const links = signal<SocialMediaLinkRow[]>([]);
  const isLoading = signal(false);

  const searchTerm = signal("");
  const categoryId = signal("");
  /** Defaults to PENDING per the spec ("by default only view entries that are
   * NOT completed"); All/Completed options remain available. */
  const completedFilter = signal<CompletedFilter>("pending");

  /** The FEED-VISIBILITY axis, independent of the completed filter above.
   * Defaults to "all" (every row, hidden included) so the admin queue shows the
   * whole moderation surface until they narrow it. */
  const visibilityFilter = signal<VisibilityFilter>("all");

  /** Server-side queue filters (Task 10 resolver args), debounced like search.
   * Empty string = no filter on that axis; the applied snapshot is taken when
   * the debounce fires so a slow dial of the selects sends one coherent query. */
  const filterLineId = signal("");
  const filterVehicleId = signal("");
  const filterStationId = signal("");
  const filterDateFrom = signal("");
  const filterDateTo = signal("");

  /** Is the loaded queue EVERY link there is?
   *
   *  🔴 This is the precondition for the sequence actions, and the reason they are
   *  disabled under any filter: `reorderSocialMediaLinks` permutes ONE sibling
   *  SET, so a payload built from a filtered page is a PARTIAL permutation. That
   *  does not fail loudly — the server writes the named ids first and leaves every
   *  unnamed sibling after them — so the call SUCCEEDS and silently shoves a row
   *  the admin cannot see to the end of the conversation. Offering it here would
   *  let the stored order quietly disagree with the order on screen, which is
   *  worse than not offering the action at all.
   *
   *  Only an unfiltered queue proves otherwise: the console resolver has no
   *  pagination and no row cap (backend `get_social_media_links`), so "no search,
   *  no category, no line/vehicle/station, no date window, Status on All" means
   *  the loaded set is the whole table and therefore the whole of every sibling
   *  set in it. The status filter counts: the queue DEFAULTS to Pending, which
   *  already hides every completed row.
   *
   *  It is a SIGNAL, not a computed over the filter controls, because the answer
   *  belongs to the ROWS and not to the dials: a dial changes up to a trailing
   *  debounce before any refetch, so a computed would re-enable the action while
   *  a filtered page was still on screen. `fetchLinks` writes it from the same
   *  applied filter snapshot that built the query — SNAPSHOT BEFORE that query is
   *  awaited, not read back after it, see that method — so the flag and the rows
   *  it describes cannot disagree. The toolbar's "Show all links" action
   *  (`showAllLinks`) writes that unfiltered snapshot in one click, which is what
   *  makes the state reachable from the default (Pending) queue.
   *
   *  🔴 READ AS A RENDER GATE, NOT ONLY AS A DISABLED STATE. The per-row Move up /
   *  Move down buttons are not drawn at all while this is false. Nothing is
   *  weakened by that — `reorderSiblings` refuses on the same condition, and the
   *  per-button `[disabled]` keeps the run-end reasons once the queue IS whole —
   *  but two permanently greyed buttons on every row of the default Pending queue
   *  read as BROKEN rather than as unavailable, and the toolbar hint names the one
   *  click that resolves them. */
  const queueIsComplete = signal(false);

  /** The APPLIED filter snapshot the queue's query (and its completeness answer) is built from —
   *  written when a control commits, never the live signals. Always REPLACED, never mutated, so a
   *  snapshot a request captured keeps describing that request. */
  let applied: AppliedQueueFilters = {
    categoryId: "",
    completed: "pending",
    visibility: "all",
  };

  /** Is a `load()` waiting for the current one to finish before it runs? A plain
   *  field, not a signal: nothing renders from it, it is read and written only
   *  inside `load()`. See that method for why a mid-load call is queued rather
   *  than dropped. */
  let reloadQueued = false;

  function onSearchInput(value: string): void {
    searchTerm.set(value);
    queueDebouncer.push(() => {
      applied = { ...applied, search: searchTermOrUndefined(searchTerm()) };
      load();
    });
  }

  function onCategoryChange(value: string): void {
    categoryId.set(value);
    applied = { ...applied, categoryId: value };
    load();
  }

  function onCompletedFilterChange(value: CompletedFilter): void {
    completedFilter.set(value);
    applied = { ...applied, completed: value };
    load();
  }

  /** Visibility refetches immediately, exactly like the Status select above. */
  function onVisibilityFilterChange(value: VisibilityFilter): void {
    visibilityFilter.set(value);
    applied = { ...applied, visibility: value };
    load();
  }

  function pushFilterChange(): void {
    queueDebouncer.push(() => {
      applied = {
        ...applied,
        lineId: filterLineId() || undefined,
        vehicleId: filterVehicleId() || undefined,
        stationId: filterStationId() || undefined,
        dateFrom: filterDateFrom() || undefined,
        dateTo: filterDateTo() || undefined,
      };
      load();
    });
  }

  function onFilterLineChange(value: string): void {
    filterLineId.set(value);
    // A vehicle/station hidden by the new line must not keep narrowing the query.
    filterVehicleId.set("");
    filterStationId.set("");
    pushFilterChange();
  }

  function onFilterVehicleChange(value: string): void {
    filterVehicleId.set(value);
    pushFilterChange();
  }

  function onFilterStationChange(value: string): void {
    filterStationId.set(value);
    pushFilterChange();
  }

  function onDateFromInput(value: string): void {
    filterDateFrom.set(value);
    pushFilterChange();
  }

  function onDateToInput(value: string): void {
    filterDateTo.set(value);
    pushFilterChange();
  }

  function resetFilters(): void {
    applyQueueFilters("pending");
    load();
  }

  /** Drop EVERY filter and load the queue with Status on All — the state
   *  `queueIsComplete` exists to certify, offered as one click because the
   *  sequence actions are otherwise unreachable from the default (Pending) view:
   *  they are NOT DRAWN there at all, so this button is the whole route to the
   *  enabled state. "Reset" deliberately cannot stand in for it — Reset restores
   *  the QUEUE DEFAULT, which is Pending, and Pending is itself the filter that
   *  keeps reordering off. The applied snapshot is written synchronously with the
   *  controls (no debounce) so `fetchLinks` reads a complete, coherent state on
   *  the very query this triggers.
   *
   *  ⚠️ IT IS NEVER DISABLED, not even while a load is in flight, and that is a
   *  deliberate combination with `load()`'s queue-and-replay: an admin who clicks
   *  it during the first load gets the unfiltered queue, not a dropped click over
   *  controls that have already moved. The snapshot written above is the one the
   *  replayed (or the in-flight mutation's own) `fetchLinks` reads. */
  function showAllLinks(): void {
    applyQueueFilters("any");
    load();
  }

  /** Write one coherent filter snapshot — live controls AND the applied fields
   *  `fetchLinks` reads — for the two whole-queue actions above. `completed` is
   *  the one axis they disagree on, which is exactly why it is the parameter:
   *  every other axis is cleared in both. The trailing debounce the search and
   *  the multi-selects otherwise sit behind is cancelled because a pending
   *  keystroke firing after this write would re-apply a filter the admin just
   *  cleared. */
  function applyQueueFilters(completed: CompletedFilter): void {
    queueDebouncer.cancel();
    searchTerm.set("");
    categoryId.set("");
    completedFilter.set(completed);
    visibilityFilter.set("all");
    filterLineId.set("");
    filterVehicleId.set("");
    filterStationId.set("");
    filterDateFrom.set("");
    filterDateTo.set("");
    applied = { categoryId: "", completed, visibility: "all" };
  }

  /** 🔴 A `load()` ARRIVING MID-LOAD IS QUEUED, NOT SWALLOWED.
   *
   *  The re-entrancy guard below exists so two filter changes cannot interleave
   *  two queries, and it does that job. What it used to do to the toolbar's "Show
   *  all links" was drop the click on the floor, and the drop was SILENT: the
   *  button had been disabled while `isLoading()` (the reason it was greyed), so
   *  the click could not land at all; the button is no longer disabled — it is the
   *  one action that must look ready — and `showAllLinks` has ALREADY rewritten
   *  the applied filter snapshot by the time it calls this. Swallowing the call
   *  would therefore leave the controls showing "All" over the PENDING rows that
   *  the in-flight query is still returning: the admin clicks "Show all links",
   *  the dials visibly change, and nothing happens.
   *
   *  So a second arrival parks a reload and `finishLoading()` replays it once the
   *  flag drops. The replay is what makes the click take effect; the filter
   *  snapshot it reads is already the unfiltered one.
   *
   *  ⚠️ THE DRAIN IS IN `finishLoading()`, NOT HERE, and that is load-bearing
   *  rather than tidiness. Six of the seven verbs that hold this flag — grouping,
   *  ungrouping, reordering, approve, hide, mark-completed — set it themselves and
   *  run `fetchLinks()` directly, so they never pass through this method. An admin
   *  who clicks "Show all links" while one of THEIR refetches is in flight parks a
   *  reload here, and if the drain lived in this `finally` it would sit unclaimed
   *  until some later unrelated `load()` spent it: the dials would read "All" over
   *  the PENDING rows the refetch returned, the hint would still be on screen, and
   *  the admin's click would appear to do nothing until they pressed it a second
   *  time — the swallowed click, relocated by one window. `finishLoading` is called
   *  from every site that drops the flag, so no in-flight request can strand it. */
  async function load(): Promise<void> {
    if (isLoading()) {
      reloadQueued = true;
      return;
    }
    isLoading.set(true);
    try {
      await fetchLinks();
    } finally {
      finishLoading();
    }
  }

  /** 🔴 THE ONE PLACE `isLoading` DROPS, and therefore the one place a reload
   *  parked by `load()` is drained.
   *
   *  Every verb that occupies the queue — `load()` itself and all six mutations —
   *  ends in a `finally` that hands off here, which is what makes the guarantee
   *  "a 'Show all links' click is never silently dropped" hold for ALL of them and
   *  not just for the one that goes through `load()`. The window that needs this is
   *  spelled out on `load()`: a mutation's own post-write refetch holds the flag
   *  long enough for the admin to click, and that refetch never returns here.
   *
   *  A METHOD RATHER THAN INLINE CODE in seven `finally` blocks because the rule has
   *  to hold for the NEXT verb too. An eighth site that cleared the flag directly
   *  would compile, pass every spec, and strand the next parked reload — the failure
   *  is invisible until an admin hits that exact window, so it belongs in one place
   *  a reader can check rather than in seven places a reader has to.
   *
   *  `void load()` is deliberate: the caller is inside its own `finally` and
   *  must not have its return value (the mutation's success/failure) overwritten by
   *  a follow-up query's outcome. It is fire-and-forget because `load()` is a pure
   *  side effect on signals, and re-entering it here is exactly the mid-load case it
   *  handles — `isLoading` is already false, so this is a normal fresh load, not a
   *  second arrival.
   *
   *  ⚠️ NOT FOR `isSaving` / `isDeleting`. Those are the DETAIL SHEET's two flags
   *  with their own lifecycles and their own buttons; routing them here would make a
   *  save replay a queued "Show all links", which no click asked for. */
  function finishLoading(): void {
    isLoading.set(false);
    if (reloadQueued) {
      reloadQueued = false;
      void load();
    }
  }

  /** The actual links query, without load()'s re-entrancy guard — callers
   * that already hold the loading flag (markCompleted) use this directly. */
  async function fetchLinks(): Promise<void> {
    /* 🔴 SNAPSHOT THE COMPLETENESS ANSWER BEFORE THE FIRST `await`, never read it
     * back after the request. `vars` below is built from the applied snapshot
     * in the same synchronous run, so the flag has to describe THAT query — and
     * `applied` is a plain field that every commit replaces, so a later read describes
     * whatever the admin has done since.
     *
     * The window is real: `showAllLinks` rewrites every applied field to the
     * unfiltered snapshot and calls `load()` while a FILTERED request is still in
     * flight. Reading `appliedFiltersAreUnfiltered()` after that request resolves
     * would read the NEW snapshot over rows the FILTERED query produced — the flag
     * would claim a whole queue over a partial page, and the sequence buttons would
     * light up over rows whose siblings are not loaded, which is precisely the state
     * the flag exists to prevent. Capturing it here is what keeps the flag and the
     * rows it describes from ever disagreeing. */
    const snapshot = applied;
    const isComplete = appliedFiltersAreUnfiltered(snapshot);
    try {
      const idToken = await auth.idToken();
      const vars = queueQueryVars(snapshot);
      const data = await graphql.request<SocialMediaLinksQueryData, SocialMediaLinksQueryVars>(
        SOCIAL_MEDIA_LINKS_QUERY,
        vars,
        idToken ? { "firebase-auth-key": idToken } : {},
      );
      links.set(data.socialMediaLinks);
      // The CAPTURED answer, not a fresh read — see the note above. Written only on
      // success, so the flag can never claim a whole queue over rows a failed query
      // never replaced. This is what gates the sequence actions.
      queueIsComplete.set(isComplete);
    } catch (err) {
      toast.error("Couldn't load links", err instanceof Error ? err.message : "Unknown error");
    }
  }

  return {
    links,
    isLoading,
    queueIsComplete,
    searchTerm,
    categoryId,
    completedFilter,
    visibilityFilter,
    filterLineId,
    filterVehicleId,
    filterStationId,
    filterDateFrom,
    filterDateTo,
    onSearchInput,
    onCategoryChange,
    onCompletedFilterChange,
    onVisibilityFilterChange,
    onFilterLineChange,
    onFilterVehicleChange,
    onFilterStationChange,
    onDateFromInput,
    onDateToInput,
    resetFilters,
    showAllLinks,
    load,
    finishLoading,
    fetchLinks,
  };
}

export type LinksQueue = ReturnType<typeof injectLinksQueue>;
