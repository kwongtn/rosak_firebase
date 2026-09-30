import { DatePipe } from "@angular/common";
import { Component, computed, inject, signal } from "@angular/core";
import { AuthService } from "../../../../core/auth/auth.service";
import { graphqlResource, GraphQLClient } from "../../../../core/graphql/graphql-client";
import { ToastService } from "../../../../ui/toast/toast.service";
import { HlmBadge } from "../../../../ui/badge/badge";
import { HlmButton } from "../../../../ui/button/button";
import { HlmCardImports } from "../../../../ui/card/card";
import { ErrorBoxComponent } from "../../../../ui/error-box/error-box";
import { HlmInput } from "../../../../ui/input/input";
import { HlmNativeSelect } from "../../../../ui/select/native-select";
import { HlmSheet, HlmSheetBody, HlmSheetFooter, HlmSheetHeader } from "../../../../ui/sheet/sheet";
import { HlmSkeleton } from "../../../../ui/skeleton/skeleton";
import { HlmTableImports } from "../../../../ui/table/table";
import { AppNavComponent } from "../../../../shell/app-nav/app-nav.component";
import { AppFooterComponent } from "../../../../shell/app-footer/app-footer.component";
import { ConsoleNavComponent } from "../../console-nav.component";
import {
  AssetMultiSelectComponent,
  type AssetMultiSelectOption,
} from "../../../insiden/asset-multi-select/asset-multi-select.component";
import {
  INSIDEN_REFERENCE_QUERY,
  type InsidenReferenceQueryData,
} from "../../../insiden/data/insiden.queries";
import {
  CONSOLE_CATEGORIES_QUERY,
  ConsoleCategoriesQueryData,
  DELETE_SOCIAL_MEDIA_LINK_MUTATION,
  DeleteSocialMediaLinkData,
  DeleteSocialMediaLinkVars,
  MARK_LINK_COMPLETED_MUTATION,
  MarkLinkCompletedData,
  MarkLinkCompletedVars,
  SOCIAL_MEDIA_LINKS_QUERY,
  SocialMediaLinkRow,
  SocialMediaLinksQueryData,
  SocialMediaLinksQueryVars,
  UPDATE_SOCIAL_MEDIA_LINK_MUTATION,
  UpdateSocialMediaLinkData,
  UpdateSocialMediaLinkVars,
} from "../data/insiden-console.queries";
import {
  SEARCH_DEBOUNCE_MS,
  createTrailingDebounce,
  searchTermOrUndefined,
} from "../data/search-debounce.util";
import { dateInputToIsoStart, dateInputToIsoEnd } from "../data/date-range.util";
import { linkStatusInput } from "../data/link-status-input.util";
import {
  isoToOccurredAtInput,
  occurredAtInputToIso,
} from "../../../insiden/data/link-occurred-at.util";
import {
  areAllSelected,
  canGroup,
  selectedWithin,
  threadLabel,
  toggleSelection,
} from "../../../insiden/data/link-thread-selection.util";
import {
  GROUP_SOCIAL_MEDIA_LINKS_MUTATION,
  GroupSocialMediaLinksData,
  GroupSocialMediaLinksVars,
  UNGROUP_SOCIAL_MEDIA_LINKS_MUTATION,
  UngroupSocialMediaLinksData,
  UngroupSocialMediaLinksVars,
} from "../../../insiden/data/social-links.queries";
import type { SocialMediaLinkStatus } from "../../../home/data/home.queries";

type CompletedFilter = "any" | "pending" | "completed";

const COMPLETED_LABEL: Record<CompletedFilter, string> = {
  any: "All",
  pending: "Pending",
  completed: "Completed",
};

/**
 * /console/insiden/links — triage queue for crowd-submitted social media
 * posts. Text search (URL + title, matched server-side) is debounced; the
 * category dropdown and the All/Pending/Completed status select refetch
 * immediately. The line/vehicle/station selects and the occurred-between
 * date range also refetch through the same trailing debounce (they map to the
 * backend resolver's `lineId`/`vehicleId`/`stationId`/`occurredAfter`/
 * `occurredBefore` args) — and, per the spec, the queue defaults to the
 * PENDING (not-completed) filter, with All/Completed still reachable.
 *
 * TWO CLOCKS, ON PURPOSE. The queue is sorted on the EVENT instant
 * (`occurredAt`, `-occurredAt, -id`) and the range filter windows the same
 * column, but an admin moderates against the REPORT instant (`created`) — "how
 * long has this been sitting un-reviewed" is a `created` question, and "is this
 * report back-dated" is an `occurredAt` one. So the table shows BOTH columns
 * side by side and the filter is labelled "Occurred between" rather than
 * "Submitted between": one filter label cannot honestly describe a window over
 * `occurredAt` any more. This is also why the two instants are never conflated
 * in the payload — see `linkStatusInput` and the `occurredAt` note in
 * `saveLinkEdit` for the tri-state that keeps a save from silently rewriting one
 * as the other.
 *
 * Row click opens a fully editable panel: the same field set as "Submit a
 * link" (URL required, title optional, the optional "when did this happen?"
 * datetime, lines/vehicles/stations/categories multi-selects) pre-filled from
 * the selected row. Save calls the IsAdmin `updateSocialMediaLink` — the backend
 * replaces the M2M sets verbatim, so every editable field is sent — then patches
 * the row locally. Mark-completed calls the admin mutation and reloads so the
 * row's completion state and timestamp come back as server truth. The detail
 * card names the completing admin (`completedBy`) next to `completedAt`.
 *
 * Approve is the publish gate for a row that isn't LIVE yet (a community
 * submission, or an auto-ingested operator post): it sends the same
 * `updateSocialMediaLink` with `status: "LIVE"`, then reloads. Hide is its
 * moderation counterpart (`status: "HIDDEN"`) for rows that must not appear in
 * the feed at all — it is offered on every row that isn't already HIDDEN, and
 * Approve stays available on a hidden row so un-hiding is just Approve. Both go
 * through one private `setLinkStatus`, which re-sends the row's full payload
 * (the input is replace-not-patch) and reloads. The console route is already
 * `adminOnlyGuard`-gated, and the backend refuses a non-admin status change, so
 * the row action carries no second permission check.
 *
 * THREAD GROUPING is a moderation/organisation tool here, NOT a display mode:
 * the list stays flat, every link gets its own row, and grouping is expressed
 * only as a `N links` chip on a root plus the per-row Ungroup. The chip is
 * load-bearing rather than decorative — a thread is public IFF its ROOT is, so
 * hiding a root silently pulls every member out of the feed with it. Nothing in
 * the row states that, so `hideLink` asks before doing it (see
 * `confirmThreadCoupling`). Selection itself is pure: `selectedIds` is only ever
 * built and judged through `link-thread-selection.util.ts`, the same module the
 * profile surface's "My Submitted Links" uses, so the two cannot drift on
 * questions like "may I group this?" and "does this row show a chip?".
 */
@Component({
  selector: "app-console-social-media-links",
  imports: [
    AppNavComponent,
    AppFooterComponent,
    AssetMultiSelectComponent,
    DatePipe,
    ErrorBoxComponent,
    HlmBadge,
    HlmButton,
    HlmInput,
    HlmNativeSelect,
    HlmSkeleton,
    HlmSheet,
    HlmSheetHeader,
    HlmSheetBody,
    HlmSheetFooter,
    ...HlmCardImports,
    ...HlmTableImports,
    ConsoleNavComponent,
  ],
  templateUrl: "./links.component.html",
})
export class SocialMediaLinksComponent {
  private readonly graphql = inject(GraphQLClient);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  /** One trailing debounce serves search AND the filter controls — last change wins. */
  private readonly queueDebouncer = createTrailingDebounce(SEARCH_DEBOUNCE_MS);

  protected readonly links = signal<SocialMediaLinkRow[]>([]);
  protected readonly categories = signal<{ id: string; name: string }[]>([]);
  protected readonly isLoading = signal(false);

  protected readonly skeletonRows = [0, 1, 2, 3, 4];

  protected readonly searchTerm = signal("");
  protected readonly categoryId = signal("");
  /** Defaults to PENDING per the spec ("by default only view entries that are
   * NOT completed"); All/Completed options remain available. */
  protected readonly completedFilter = signal<CompletedFilter>("pending");
  protected readonly completedFilterLabel = COMPLETED_LABEL;

  /** Server-side queue filters (Task 10 resolver args), debounced like search.
   * Empty string = no filter on that axis; the applied snapshot is taken when
   * the debounce fires so a slow dial of the selects sends one coherent query. */
  protected readonly filterLineId = signal("");
  protected readonly filterVehicleId = signal("");
  protected readonly filterStationId = signal("");
  protected readonly filterDateFrom = signal("");
  protected readonly filterDateTo = signal("");

  protected readonly selectedLink = signal<SocialMediaLinkRow | null>(null);

  /** Rows ticked for the group action. Built ONLY through `toggleSelection` from
   *  `link-thread-selection.util.ts` and never by concatenation, because that
   *  module's contract is what makes this safe to feed straight back into a
   *  signal: every helper returns a NEW array, and a duplicate id (or a blank
   *  one) is a hard rejection server-side (`[ID!]!` plus an explicit repeat
   *  check).
   *
   *  The selection deliberately SURVIVES a refetch — narrowing a filter is not an
   *  intent to forget — so every mutation scopes it to `visibleLinkIds` before
   *  sending. Without that, ticking three rows, narrowing the search and hitting
   *  Group would post ids the admin can no longer see, and the all-or-nothing
   *  rejection would read as a plain "grouping failed". */
  protected readonly selectedIds = signal<string[]>([]);

  /** The ids actually on screen — the scope of every grouping mutation. */
  protected readonly visibleLinkIds = computed(() => this.links().map((link) => link.id));

  protected readonly selectedCount = computed(() => this.selectedIds().length);

  /** At least TWO links. Delegated to `canGroup` rather than re-derived, so the
   *  "a one-link thread is a no-op that renders as a thread" rule lives in
   *  exactly one place — the one the profile surface's grouping UI also reads. */
  protected readonly canGroupSelection = computed(() => canGroup(this.selectedIds()));

  /** Drives the header Select-all checkbox. False over an empty page on purpose
   *  (see `areAllSelected`). */
  protected readonly allVisibleSelected = computed(() =>
    areAllSelected(this.selectedIds(), this.visibleLinkIds()),
  );

  /** Re-exposed, not re-implemented: an Angular template can only read members off
   *  the component class, and the pluralisation of a thread size is decided in
   *  exactly one module so this table and the profile surface's badge cannot end
   *  up disagreeing ("1 links" vs "2 link"). */
  protected readonly threadLabel = threadLabel;

  /** Edit form state — same signals as LinkFormComponent's fields, driven by
   * the console's own sheet instead of LinkSheetService. */
  protected readonly editUrl = signal("");
  protected readonly editTitle = signal("");
  /** "When did this happen?" — a `datetime-local` value (`YYYY-MM-DDTHH:mm`, naive
   *  local wall time), hydrated from the row's `occurredAt` and NOT from `created`:
   *  a link whose event time differs from its report time is exactly the one an
   *  admin opens this sheet to correct, so hydrating from the wrong column would
   *  quietly rewrite it on the very next save. */
  protected readonly editOccurredAt = signal("");
  protected readonly urlTouched = signal(false);
  protected readonly isEditing = signal(false);
  protected readonly isSaving = signal(false);
  protected readonly isDeleting = signal(false);

  protected readonly selectedLineIds = signal<string[]>([]);
  protected readonly selectedVehicleIds = signal<string[]>([]);
  protected readonly selectedStationIds = signal<string[]>([]);
  protected readonly selectedCategoryIds = signal<string[]>([]);

  protected readonly referenceResource = graphqlResource<InsidenReferenceQueryData>(() => ({
    query: INSIDEN_REFERENCE_QUERY,
  }));

  protected readonly lineOptions = computed<AssetMultiSelectOption[]>(() =>
    (this.referenceResource.data()?.lines ?? []).map((line) => ({
      id: line.id,
      label: `${line.code} — ${line.displayName}`,
    })),
  );

  private readonly _linesById = computed(() => {
    const lines = this.referenceResource.data()?.lines ?? [];
    return new Map(lines.map((line) => [line.id, line]));
  });

  /** A vehicle's true line memberships, computed over ALL lines (not just the
   * selected-filtered view vehicleOptions() uses) — a vehicle's parent codes
   * shouldn't disappear just because its line got unchecked. */
  private readonly _vehicleParentCodes = computed(() => {
    const lines = this.referenceResource.data()?.lines ?? [];
    const map = new Map<string, string[]>();
    for (const line of lines) {
      for (const vehicleType of line.vehicleTypes) {
        for (const vehicle of vehicleType.vehicles) {
          const codes = map.get(vehicle.id);
          if (codes) {
            if (!codes.includes(line.code)) {
              codes.push(line.code);
            }
          } else {
            map.set(vehicle.id, [line.code]);
          }
        }
      }
    }
    return map;
  });

  private readonly _vehiclesById = computed(() => {
    const map = new Map<string, { id: string; identificationNo: string }>();
    for (const line of this.referenceResource.data()?.lines ?? []) {
      for (const vehicleType of line.vehicleTypes) {
        for (const vehicle of vehicleType.vehicles) {
          map.set(vehicle.id, { id: vehicle.id, identificationNo: vehicle.identificationNo });
        }
      }
    }
    return map;
  });

  protected readonly vehicleOptions = computed<AssetMultiSelectOption[]>(() => {
    const selected = this.selectedLineIds();
    const lines =
      selected.length > 0
        ? selected.map((id) => this._linesById().get(id))
        : [...this._linesById().values()];
    const seen = new Set<string>();
    const options: AssetMultiSelectOption[] = [];
    for (const line of lines) {
      if (!line) continue;
      for (const vehicleType of line.vehicleTypes) {
        for (const vehicle of vehicleType.vehicles) {
          if (seen.has(vehicle.id)) continue;
          seen.add(vehicle.id);
          options.push({
            id: vehicle.id,
            label: vehicle.identificationNo,
            parentCodes: this._vehicleParentCodes().get(vehicle.id),
          });
        }
      }
    }
    return options;
  });

  private readonly _stationsById = computed(
    () => new Map((this.referenceResource.data()?.stations ?? []).map((s) => [s.id, s])),
  );

  protected readonly stationOptions = computed<AssetMultiSelectOption[]>(() =>
    (this.referenceResource.data()?.stations ?? []).map((station) => ({
      id: station.id,
      label: station.displayName,
      parentCodes: (station.lines ?? []).map((l) => l.code),
    })),
  );

  /** Filter controls reuse the reference data + parent-filtering pattern, keyed
   * on the FILTER line instead of the edit form's selectedLineIds. Selecting a
   * line narrows the vehicle/station dropdowns to its assets; no line = all. */
  protected readonly filterVehicleOptions = computed<AssetMultiSelectOption[]>(() => {
    const lineId = this.filterLineId();
    const line = lineId ? this._linesById().get(lineId) : undefined;
    const lines = line ? [line] : [...this._linesById().values()];
    const seen = new Set<string>();
    const options: AssetMultiSelectOption[] = [];
    for (const entry of lines) {
      if (!entry) continue;
      for (const vehicleType of entry.vehicleTypes) {
        for (const vehicle of vehicleType.vehicles) {
          if (seen.has(vehicle.id)) continue;
          seen.add(vehicle.id);
          options.push({
            id: vehicle.id,
            label: vehicle.identificationNo,
            parentCodes: this._vehicleParentCodes().get(vehicle.id),
          });
        }
      }
    }
    return options;
  });

  protected readonly filterStationOptions = computed<AssetMultiSelectOption[]>(() => {
    const lineId = this.filterLineId();
    const stations = lineId
      ? (this.referenceResource.data()?.stations ?? []).filter((s) =>
          (s.lines ?? []).some((l) => l.id === lineId),
        )
      : (this.referenceResource.data()?.stations ?? []);
    return stations.map((station) => ({
      id: station.id,
      label: station.displayName,
      parentCodes: (station.lines ?? []).map((l) => l.code),
    }));
  });

  private readonly _categoriesById = computed(
    () =>
      new Map(
        (this.referenceResource.data()?.calendarIncidentCategories ?? []).map((c) => [c.id, c]),
      ),
  );

  protected readonly categoryOptions = computed<AssetMultiSelectOption[]>(() =>
    (this.referenceResource.data()?.calendarIncidentCategories ?? []).map((category) => ({
      id: category.id,
      label: category.name,
    })),
  );

  /** Mirrors link-form.schema's `required(f.url)` — Save is disabled while the URL is blank. */
  protected readonly canSave = computed(() => this.editUrl().trim().length > 0);

  private appliedSearch: string | undefined;
  private appliedCategoryId = "";
  private appliedCompleted: CompletedFilter = "pending";
  private appliedLineId: string | undefined;
  private appliedVehicleId: string | undefined;
  private appliedStationId: string | undefined;
  private appliedDateFrom: string | undefined;
  private appliedDateTo: string | undefined;

  constructor() {
    this.load();
    this.loadCategories();
  }

  protected onSearchInput(value: string): void {
    this.searchTerm.set(value);
    this.queueDebouncer.push(() => {
      this.appliedSearch = searchTermOrUndefined(this.searchTerm());
      this.load();
    });
  }

  protected onCategoryChange(value: string): void {
    this.categoryId.set(value);
    this.appliedCategoryId = value;
    this.load();
  }

  protected onCompletedFilterChange(value: CompletedFilter): void {
    this.completedFilter.set(value);
    this.appliedCompleted = value;
    this.load();
  }

  private pushFilterChange(): void {
    this.queueDebouncer.push(() => {
      this.appliedLineId = this.filterLineId() || undefined;
      this.appliedVehicleId = this.filterVehicleId() || undefined;
      this.appliedStationId = this.filterStationId() || undefined;
      this.appliedDateFrom = this.filterDateFrom() || undefined;
      this.appliedDateTo = this.filterDateTo() || undefined;
      this.load();
    });
  }

  protected onFilterLineChange(value: string): void {
    this.filterLineId.set(value);
    // A vehicle/station hidden by the new line must not keep narrowing the query.
    this.filterVehicleId.set("");
    this.filterStationId.set("");
    this.pushFilterChange();
  }

  protected onFilterVehicleChange(value: string): void {
    this.filterVehicleId.set(value);
    this.pushFilterChange();
  }

  protected onFilterStationChange(value: string): void {
    this.filterStationId.set(value);
    this.pushFilterChange();
  }

  protected onDateFromInput(value: string): void {
    this.filterDateFrom.set(value);
    this.pushFilterChange();
  }

  protected onDateToInput(value: string): void {
    this.filterDateTo.set(value);
    this.pushFilterChange();
  }

  protected resetFilters(): void {
    this.searchTerm.set("");
    this.categoryId.set("");
    this.completedFilter.set("pending");
    this.filterLineId.set("");
    this.filterVehicleId.set("");
    this.filterStationId.set("");
    this.filterDateFrom.set("");
    this.filterDateTo.set("");
    this.queueDebouncer.cancel();
    this.appliedSearch = undefined;
    this.appliedCategoryId = "";
    this.appliedCompleted = "pending";
    this.appliedLineId = undefined;
    this.appliedVehicleId = undefined;
    this.appliedStationId = undefined;
    this.appliedDateFrom = undefined;
    this.appliedDateTo = undefined;
    this.load();
  }

  /* ---- Multi-select + thread grouping ---------------------------------- */

  /** One row's checkbox. Routed through the shared helper because the result is
   *  written straight back into a signal: an in-place `push`/`splice` would
   *  produce the SAME array reference, change detection would never fire, and
   *  the checkbox would silently stop responding. */
  protected toggleRowSelection(id: string): void {
    this.selectedIds.set(toggleSelection(this.selectedIds(), id));
  }

  /** The header checkbox. Replaces the selection with the whole visible page, or
   *  clears it when the page is already fully selected — never merges, so
   *  repeated clicks can't accumulate a hidden selection from a previous filter.
   *  Stays unchecked over an empty page: "select all" of nothing is a lie, and an
   *  invitation to post an empty selection. */
  protected toggleSelectAll(): void {
    this.selectedIds.set(this.allVisibleSelected() ? [] : [...this.visibleLinkIds()]);
  }

  protected clearSelection(): void {
    this.selectedIds.set([]);
  }

  /** Start a NEW thread from the ticked rows (no `threadId` sent, so the backend
   *  elects the root — the earliest `(occurredAt, id)` of the selection).
   *
   *  Grouping is ALL-OR-NOTHING server-side: one link outside the admin's
   *  permission rejects the entire selection, so there is no partial state to
   *  render and nothing to roll back locally. A failure therefore toasts and
   *  leaves both the list and the selection exactly as they were — keeping the
   *  selection on failure is deliberate: the admin can adjust it and retry
   *  instead of re-ticking from scratch. Success reloads (the list is flat, so
   *  the server's `threadSize`/`threadId` truth is what drives the chips) and
   *  clears the selection, which is otherwise a selection of rows that are now
   *  members of one thread — i.e. a request that has already been made.
   *
   *  The returned root id is deliberately unused: it is an `Int` (every other id
   *  in this feature is a string `ID`) and exists so a COLLAPSED surface could
   *  refetch exactly one thread. This list is flat and reloads wholesale, so
   *  there is nothing to spend it on. */
  protected async groupSelected(): Promise<boolean> {
    // Scoped to what's on screen, and filtered for blanks: `linkIds` is
    // `[ID!]!`, so an empty element is a hard validation error.
    const linkIds = selectedWithin(this.selectedIds(), this.visibleLinkIds()).filter(Boolean);
    if (!canGroup(linkIds)) {
      return false;
    }
    this.isLoading.set(true);
    try {
      const idToken = await this.auth.idToken();
      await this.graphql.request<GroupSocialMediaLinksData, GroupSocialMediaLinksVars>(
        GROUP_SOCIAL_MEDIA_LINKS_MUTATION,
        { linkIds },
        idToken ? { "firebase-auth-key": idToken } : {},
      );
      this.toast.success("Links grouped", `${linkIds.length} links are now one thread.`);
      await this.fetchLinks();
      this.clearSelection();
      return true;
    } catch (err) {
      this.toast.error(
        "Couldn't group links",
        err instanceof Error ? err.message : "Unknown error",
      );
      return false;
    } finally {
      this.isLoading.set(false);
    }
  }

  /** Detach ONE member from its thread. Offered only where `threadId` is
   *  non-null, i.e. on a member — which is the only spelling of this action that
   *  does anything: ungrouping a ROOT leaves its members attached (there is
   *  nothing to detach), so a root's job here is to show the chip and the Ungroup
   *  buttons of its members, not an Ungroup of its own.
   *
   *  The asymmetry is deliberate server-side (no cascade, no re-root election), so
   *  the button detaches exactly the row it is on and the copy says so. Repeated
   *  on every member, it dissolves the thread while leaving the original root
   *  standing as a singleton — which is why the root is never re-pointed here. */
  protected async ungroupLink(link: SocialMediaLinkRow): Promise<boolean> {
    if (!link.threadId) {
      return false;
    }
    this.isLoading.set(true);
    try {
      const idToken = await this.auth.idToken();
      await this.graphql.request<UngroupSocialMediaLinksData, UngroupSocialMediaLinksVars>(
        UNGROUP_SOCIAL_MEDIA_LINKS_MUTATION,
        { linkIds: [link.id].filter(Boolean) },
        idToken ? { "firebase-auth-key": idToken } : {},
      );
      this.toast.success("Link removed from its thread", link.url);
      await this.fetchLinks();
      return true;
    } catch (err) {
      this.toast.error(
        "Couldn't ungroup link",
        err instanceof Error ? err.message : "Unknown error",
      );
      return false;
    } finally {
      this.isLoading.set(false);
    }
  }

  /** Publish a row that isn't LIVE yet (community submission or an
   *  auto-ingested operator post) through the existing update mutation.
   *
   *  `SocialMediaLinkInput` is not a patch: `url` is non-nullable and the
   *  service assigns `title` and calls `.set()` on the four M2M tag relations
   *  unconditionally, so a status-only payload would blank the title and strip
   *  every tag. The row's current scalars and ids are therefore re-sent
   *  alongside `status: "LIVE"` (see linkStatusInput). Success reloads the list
   *  so the publish state comes back as server truth; failures surface via the
   *  toast (never swallowed) and leave the list untouched. */
  protected async approveLink(link: SocialMediaLinkRow): Promise<boolean> {
    return this.setLinkStatus(link, "LIVE", "Link approved", "Couldn't approve link");
  }

  /** Moderation counterpart of approveLink: pull a row out of the public feed
   *  (`status: "HIDDEN"`) without deleting it — e.g. a celebratory update that
   *  must not sit in the feed. The row keeps its title, tags and votes because
   *  the same full payload is re-sent. Approve stays available on a hidden row,
   *  which is how an admin puts it back (Approve → `LIVE`).
   *
   *  On a thread ROOT the action is not confined to the row: the feed renders a
   *  thread as its root and a thread is public IFF its root is, so hiding the
   *  root pulls every member out of the feed too. That is a side effect on N
   *  other rows that no badge states on its own, hence the guard. */
  protected async hideLink(link: SocialMediaLinkRow): Promise<boolean> {
    if (!this.confirmThreadCoupling(link)) {
      return false;
    }
    return this.setLinkStatus(link, "HIDDEN", "Link hidden", "Couldn't hide link");
  }

  /** WHY A CONFIRM, AND WHY ONLY HERE.
   *
   *  The coupling ("a thread is public iff its root is") is real, it is
   *  invisible in the row, and it is decided at the moment of the click — so the
   *  least intrusive thing that actually communicates it is a one-time native
   *  confirm naming the count, right where the destructive decision is made. A
   *  static tooltip on the chip is not enough on its own: it is invisible until
   *  hovered, absent on touch, and gone by the time the admin reaches the Hide
   *  button two cells to the right.
   *
   *  It is NOT applied to every row. `threadLabel` returns "" for a size of 1
   *  (which is every unthreaded link AND every thread member, since `threadSize`
   *  counts only the members of the row's OWN thread), so ordinary Hide stays a
   *  single click and only a genuine multi-link root is asked about. The native
   *  `confirm()` matches the delete guard this component already uses, so the
   *  console has one confirmation idiom rather than two. */
  private confirmThreadCoupling(link: SocialMediaLinkRow): boolean {
    const members = threadLabel(link.threadSize);
    if (!members) {
      return true;
    }
    return confirm(
      `This link is a thread root with ${members} in the thread. A thread is public only while its root is, so hiding this row hides every member too. Hide the whole thread?`,
    );
  }

  /** The single status-change path for the queue (Approve / Hide). Shared so the
   *  replace-not-patch payload can never drift between the two verbs. */
  private async setLinkStatus(
    link: SocialMediaLinkRow,
    status: SocialMediaLinkStatus,
    successMessage: string,
    errorTitle: string,
  ): Promise<boolean> {
    this.isLoading.set(true);
    try {
      const idToken = await this.auth.idToken();
      await this.graphql.request<UpdateSocialMediaLinkData, UpdateSocialMediaLinkVars>(
        UPDATE_SOCIAL_MEDIA_LINK_MUTATION,
        { socialMediaLinkId: link.id, input: linkStatusInput(link, status) },
        idToken ? { "firebase-auth-key": idToken } : {},
      );
      this.toast.success(successMessage, link.url);
      await this.fetchLinks();
      return true;
    } catch (err) {
      this.toast.error(errorTitle, err instanceof Error ? err.message : "Unknown error");
      return false;
    } finally {
      this.isLoading.set(false);
    }
  }

  protected async markCompleted(link: SocialMediaLinkRow): Promise<boolean> {
    this.isLoading.set(true);
    try {
      const idToken = await this.auth.idToken();
      await this.graphql.request<MarkLinkCompletedData, MarkLinkCompletedVars>(
        MARK_LINK_COMPLETED_MUTATION,
        { linkId: link.id },
        idToken ? { "firebase-auth-key": idToken } : {},
      );
      this.toast.success("Link marked completed", link.url);
      await this.fetchLinks();
      return true;
    } catch (err) {
      this.toast.error(
        "Couldn't mark completed",
        err instanceof Error ? err.message : "Unknown error",
      );
      return false;
    } finally {
      this.isLoading.set(false);
    }
  }

  protected openLinkDetail(link: SocialMediaLinkRow): void {
    this.selectedLink.set(link);
    this.isEditing.set(true);
    this.editUrl.set(link.url);
    this.editTitle.set(link.title);
    // From `occurredAt`, never from `created` — see editOccurredAt's comment.
    this.editOccurredAt.set(isoToOccurredAtInput(link.occurredAt));
    this.urlTouched.set(false);
    this.selectedLineIds.set(link.lines.map((line) => line.id));
    this.selectedVehicleIds.set(link.vehicles.map((vehicle) => vehicle.id));
    this.selectedStationIds.set(link.stations.map((station) => station.id));
    this.selectedCategoryIds.set(link.categories.map((category) => category.id));
  }

  protected closeLinkPanel(): void {
    this.selectedLink.set(null);
    this.isEditing.set(false);
    this.editUrl.set("");
    this.editTitle.set("");
    // Reset with the rest of the form: a closed sheet must not carry one row's
    // event time into the next one an admin opens.
    this.editOccurredAt.set("");
    this.urlTouched.set(false);
    this.selectedLineIds.set([]);
    this.selectedVehicleIds.set([]);
    this.selectedStationIds.set([]);
    this.selectedCategoryIds.set([]);
  }

  protected onEditUrlInput(value: string): void {
    this.editUrl.set(value);
    this.urlTouched.set(true);
  }

  protected onEditTitleInput(value: string): void {
    this.editTitle.set(value);
  }

  protected onEditOccurredAtInput(value: string): void {
    this.editOccurredAt.set(value);
  }

  /** Full edit — same field set as "Submit a link". The backend replaces
   *  lines/vehicles/stations/categories from the input verbatim, so the payload
   *  carries the complete form state, not just the edited scalars. */
  protected async saveLinkEdit(): Promise<void> {
    const link = this.selectedLink();
    if (!link) {
      return;
    }
    if (!this.canSave()) {
      this.urlTouched.set(true);
      return;
    }
    this.isSaving.set(true);
    try {
      const idToken = await this.auth.idToken();
      await this.graphql.request<UpdateSocialMediaLinkData, UpdateSocialMediaLinkVars>(
        UPDATE_SOCIAL_MEDIA_LINK_MUTATION,
        {
          socialMediaLinkId: link.id,
          input: {
            url: this.editUrl(),
            title: this.editTitle() || null,
            lineIds: this.selectedLineIds(),
            vehicleIds: this.selectedVehicleIds(),
            stationIds: this.selectedStationIds(),
            categoryIds: this.selectedCategoryIds(),
            // ⚠️ ALWAYS send this key, and never write it as `?? undefined` or
            // `link.occurredAt ?? null`. `SocialMediaLinkInput` is
            // replace-not-patch and `occurredAt` is tri-state with a
            // DESTRUCTIVE third state:
            //   omitted        → leave the event time untouched
            //   a datetime     → set it
            //   explicit null  → RESET it to the row's submission time
            // So an untouched box round-trips the link's current event time (the
            // normal save), and a CLEARED box sends the explicit `null` on
            // purpose — "this actually happened when it was reported" is exactly
            // what null encodes, and it is the one place an admin can undo a
            // wrong guess. Omitting the key instead would make "cleared"
            // unreachable from a visible-but-empty control. Mirrors
            // LinkFormComponent.submit's identical branch.
            occurredAt: occurredAtInputToIso(this.editOccurredAt()),
          },
        },
        idToken ? { "firebase-auth-key": idToken } : {},
      );
      const updated = this.buildUpdatedLink(link);
      this.links.update((list) =>
        list.map((existing) => (existing.id === link.id ? updated : existing)),
      );
      this.selectedLink.set(updated);
      this.toast.success("Link updated", updated.url);
    } catch (err) {
      this.toast.error(
        "Couldn't save changes",
        err instanceof Error ? err.message : "Unknown error",
      );
    } finally {
      this.isSaving.set(false);
    }
  }

  /** Rebuilds the local row from the saved form state so the table row and the
   *  detail card show exactly what the backend now holds. Preference goes to
   *  reference data (it carries the display labels); anything the reference set
   *  doesn't know yet falls back to the row's own objects. */
  private buildUpdatedLink(link: SocialMediaLinkRow): SocialMediaLinkRow {
    const resolve = <T extends { id: string }>(
      ids: string[],
      current: T[],
      lookup: (id: string) => T | undefined,
    ): T[] =>
      ids
        .map((id) => lookup(id) ?? current.find((item) => item.id === id))
        .filter((x): x is T => x !== undefined);
    const linesById = this._linesById();
    const vehiclesById = this._vehiclesById();
    const stationsById = this._stationsById();
    const categoriesById = this._categoriesById();
    return {
      ...link,
      url: this.editUrl(),
      title: this.editTitle(),
      // Mirrors the tri-state the server just applied: a cleared box RESETS the
      // event time to the submission time, so the optimistic row must show that
      // same fallback rather than keep the stale value it is replacing.
      occurredAt: occurredAtInputToIso(this.editOccurredAt()) ?? link.created,
      lines: resolve(this.selectedLineIds(), link.lines, (id) => linesById.get(id)),
      vehicles: resolve(this.selectedVehicleIds(), link.vehicles, (id) => vehiclesById.get(id)),
      stations: resolve(this.selectedStationIds(), link.stations, (id) => stationsById.get(id)),
      categories: resolve(this.selectedCategoryIds(), link.categories, (id) =>
        categoriesById.get(id),
      ),
    };
  }

  protected async markCompletedFromPanel(): Promise<void> {
    const link = this.selectedLink();
    if (!link) {
      return;
    }
    const ok = await this.markCompleted(link);
    if (ok) {
      this.closeLinkPanel();
    }
  }

  /** Admin hard-delete of a link entry. Mirrors the spotting-history delete:
   *  a native confirm guard, then the admin mutation; on success the row is
   *  dropped locally and the panel closes. */
  protected async deleteLink(link: SocialMediaLinkRow): Promise<void> {
    if (!confirm("Delete this link entry? This can't be undone.")) {
      return;
    }
    this.isDeleting.set(true);
    try {
      const idToken = await this.auth.idToken();
      await this.graphql.request<DeleteSocialMediaLinkData, DeleteSocialMediaLinkVars>(
        DELETE_SOCIAL_MEDIA_LINK_MUTATION,
        { linkId: link.id },
        idToken ? { "firebase-auth-key": idToken } : {},
      );
      this.links.update((list) => list.filter((existing) => existing.id !== link.id));
      if (this.selectedLink()?.id === link.id) {
        this.closeLinkPanel();
      }
      this.toast.success("Link deleted", link.url);
    } catch (err) {
      this.toast.error(
        "Couldn't delete link",
        err instanceof Error ? err.message : "Unknown error",
      );
    } finally {
      this.isDeleting.set(false);
    }
  }

  private async load(): Promise<void> {
    if (this.isLoading()) {
      return;
    }
    this.isLoading.set(true);
    try {
      await this.fetchLinks();
    } finally {
      this.isLoading.set(false);
    }
  }

  /** The actual links query, without load()'s re-entrancy guard — callers
   * that already hold the loading flag (markCompleted) use this directly. */
  private async fetchLinks(): Promise<void> {
    try {
      const idToken = await this.auth.idToken();
      const vars: SocialMediaLinksQueryVars = {
        search: this.appliedSearch,
        categoryId: this.appliedCategoryId || undefined,
        completed:
          this.appliedCompleted === "any" ? undefined : this.appliedCompleted === "completed",
      };
      // Filter args are optional server-side (strawberry.Maybe) — omit unset
      // keys entirely so the wire never carries explicit nulls.
      if (this.appliedLineId) {
        vars.lineId = this.appliedLineId;
      }
      if (this.appliedVehicleId) {
        vars.vehicleId = this.appliedVehicleId;
      }
      if (this.appliedStationId) {
        vars.stationId = this.appliedStationId;
      }
      // The window bounds `occurredAt` — the same column the result is ordered
      // by — so the filter and the sort can never answer different questions.
      // (Backend args renamed createdAfter/createdBefore -> occurredAfter/
      // occurredBefore along with the ordering change; no alias on purpose.)
      const occurredAfter = dateInputToIsoStart(this.appliedDateFrom ?? "");
      if (occurredAfter) {
        vars.occurredAfter = occurredAfter;
      }
      const occurredBefore = dateInputToIsoEnd(this.appliedDateTo ?? "");
      if (occurredBefore) {
        vars.occurredBefore = occurredBefore;
      }
      const data = await this.graphql.request<SocialMediaLinksQueryData, SocialMediaLinksQueryVars>(
        SOCIAL_MEDIA_LINKS_QUERY,
        vars,
        idToken ? { "firebase-auth-key": idToken } : {},
      );
      this.links.set(data.socialMediaLinks);
    } catch (err) {
      this.toast.error("Couldn't load links", err instanceof Error ? err.message : "Unknown error");
    }
  }

  private async loadCategories(): Promise<void> {
    try {
      const idToken = await this.auth.idToken();
      const data = await this.graphql.request<ConsoleCategoriesQueryData>(
        CONSOLE_CATEGORIES_QUERY,
        undefined,
        idToken ? { "firebase-auth-key": idToken } : {},
      );
      this.categories.set(data.calendarIncidentCategories);
    } catch (err) {
      this.toast.error(
        "Couldn't load categories",
        err instanceof Error ? err.message : "Unknown error",
      );
    }
  }
}
