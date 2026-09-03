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
 * immediately. The line/vehicle/station selects and the submitted-between
 * date range also refetch through the same trailing debounce (they map to the
 * backend resolver's `lineId`/`vehicleId`/`stationId`/`createdAfter`/
 * `createdBefore` args) — and, per the spec, the queue defaults to the
 * PENDING (not-completed) filter, with All/Completed still reachable.
 *
 * Row click opens a fully editable panel: the same field set as "Submit a
 * link" (URL required, title optional, lines/vehicles/stations/categories
 * multi-selects) pre-filled from the selected row. Save calls the IsAdmin
 * `updateSocialMediaLink` — the backend replaces the M2M sets verbatim, so
 * every editable field is sent — then patches the row locally. Mark-completed
 * calls the admin mutation and reloads so the row's completion state and
 * timestamp come back as server truth. The detail card names the completing
 * admin (`completedBy`) next to `completedAt`.
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

  /** Edit form state — same signals as LinkFormComponent's fields, driven by
   * the console's own sheet instead of LinkSheetService. */
  protected readonly editUrl = signal("");
  protected readonly editTitle = signal("");
  protected readonly urlTouched = signal(false);
  protected readonly isEditing = signal(false);
  protected readonly isSaving = signal(false);

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
      const createdAfter = dateInputToIsoStart(this.appliedDateFrom ?? "");
      if (createdAfter) {
        vars.createdAfter = createdAfter;
      }
      const createdBefore = dateInputToIsoEnd(this.appliedDateTo ?? "");
      if (createdBefore) {
        vars.createdBefore = createdBefore;
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
