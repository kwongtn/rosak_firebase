import { Component, computed, effect, inject, input, untracked } from "@angular/core";

import { Router, RouterLink } from "@angular/router";
import { injectIsBrowser } from "../../../core/composables/is-browser";
import { resolveAdSlot } from "../../../core/ads/ads.config";
import { graphqlResource } from "../../../core/graphql/graphql-client";
import { revalidateOnReturn } from "../../../core/routing/revalidate-on-return";
import { AdSlotComponent } from "../../../ui/ad-slot/ad-slot.component";
import { HlmSkeleton } from "../../../ui/skeleton/skeleton";
import { RetryBannerComponent } from "../../../ui/retry-banner/retry-banner.component";
import { HlmCardImports } from "../../../ui/card/card";
import { HlmCombobox, ComboboxItem } from "../../../ui/combobox/combobox";
import { ToastService } from "../../../ui/toast/toast.service";
import { VehicleStatusBadge } from "../../../domain-ui/vehicle-status-badge/vehicle-status-badge";
import { WheelStatusBadge } from "../../../domain-ui/wheel-status-badge/wheel-status-badge";
import {
  dateKeyOf,
  SpottingActivityHeatmap,
  SpottingActivityPoint,
  toSpottingActivityPoints,
} from "../../../domain-ui/spotting-activity-heatmap/spotting-activity-heatmap";
import { SpottingLinesStore } from "../data/spotting-lines.store";
import { isSpottingVehicleRoute } from "../data/spotting-route-patterns";
import {
  VEHICLE_HEADER_QUERY,
  VEHICLE_SPOTTING_HISTORY_QUERY,
  VEHICLE_TYPES_QUERY,
  VehicleHeaderQueryData,
  VehicleHeaderQueryVars,
  VehicleSpottingHistoryQueryData,
  VehicleSpottingHistoryQueryVars,
  VehicleTypesQueryData,
  VehicleTypesQueryVars,
} from "../data/spotting.queries";
import { SpottingHistoryComponent } from "./spotting-history/spotting-history.component";
import { IncidentTimelineComponent } from "./incident-timeline/incident-timeline.component";
import { VehicleStatusBoardComponent } from "./vehicle-status-board/vehicle-status-board.component";
import { ReportSpottingButtonComponent } from "../report-spotting-button/report-spotting-button.component";

/**
 * /spotting/:lineId/vehicle/:vehicleId — a single vehicle's full status/history/incidents.
 * This is the shareable permalink the old design never had (inline-expand-only rows with no
 * URL of their own) — see the rewrite plan's routing rationale.
 *
 * Data flow: the header and status board come from one single-vehicle query, and the incident
 * timeline, spotting history and activity heatmap need only `vehicleId()`, so all of them request
 * in parallel. The line roster feeds only the vehicle-switcher combobox, so it loads in the
 * browser after hydration, off the header's critical path and out of the SSR payload.
 */
@Component({
  selector: "app-vehicle-detail",
  imports: [
    RouterLink,
    HlmSkeleton,
    AdSlotComponent,
    RetryBannerComponent,
    HlmCombobox,
    ...HlmCardImports,
    VehicleStatusBadge,
    WheelStatusBadge,
    SpottingActivityHeatmap,
    SpottingHistoryComponent,
    IncidentTimelineComponent,
    VehicleStatusBoardComponent,
    ReportSpottingButtonComponent,
  ],
  template: `
    <div class="flex flex-col gap-6">
      @if (vehicleResource.hasError()) {
        <app-retry-banner [resource]="vehicleResource" message="Couldn't load this vehicle." />
      } @else if (_vehicle(); as vehicle) {
        <nav class="flex items-center gap-1.5 text-sm">
          <a
            [routerLink]="['/spotting', lineId()]"
            class="text-muted-foreground hover:text-foreground hover:underline"
          >
            {{ _lineCode() }}
          </a>
          <span class="text-muted-foreground">/</span>
          <span class="text-muted-foreground">Vehicle</span>
          <span class="text-muted-foreground">/</span>
          <hlm-combobox
            class="field-sizing-content !border-none !bg-transparent !py-0.5 !pl-0 !font-medium"
            aria-label="Switch vehicle"
            [value]="vehicleId()"
            (valueChange)="onSwitchVehicle($event)"
            [items]="vehicleItems()"
            [itemTemplate]="vehicleOptionTpl"
            emptyMessage="No matching vehicles"
          />
          <ng-template #vehicleOptionTpl let-item>
            <span class="flex w-full items-center justify-between gap-2">
              <span>{{ item.label }}</span>
              <vehicle-status-badge [status]="item.meta.status" />
            </span>
          </ng-template>
        </nav>

        <div class="flex items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-3">
            <h1 class="text-xl font-semibold">{{ vehicle.identificationNo }}</h1>
            <vehicle-status-badge [status]="vehicle.status" />
            <wheel-status-badge [status]="vehicle.wheelStatus" />
          </div>
          <app-report-spotting-button />
        </div>
        @if (vehicle.nickname) {
          <p class="text-muted-foreground text-sm">{{ vehicle.nickname }}</p>
        }
        @if (vehicle.notes) {
          <p class="text-sm">{{ vehicle.notes }}</p>
        }

        <app-vehicle-status-board [vehicle]="vehicle" />

        <div hlmCard>
          <div hlmCardHeader>
            <h2 hlmCardTitle>
              Spotting Activity — {{ _todaySpottingsCount() }} spotting{{
                _todaySpottingsCount() === 1 ? "" : "s"
              }}
              today
            </h2>
          </div>
          <div hlmCardContent>
            <spotting-activity-heatmap
              [data]="_vehicleTrends()"
              [totalAllTime]="vehicle.spottingCount"
            />
          </div>
        </div>
      } @else if (!_isNotFound()) {
        <div class="flex flex-col gap-4">
          <div hlmSkeleton class="h-6 w-48"></div>
          <div hlmSkeleton class="h-24 w-full"></div>
        </div>
      }

      <!-- These only need vehicleId(), so they live outside the header's @if: their queries start
           with the header's, and their own loading placeholders show straight away. They stay
           hidden when the header failed or the vehicle does not exist, where "No record" would
           read as a fact about a vehicle we could not load. -->
      @if (_showDetails()) {
        <div hlmCard>
          <div hlmCardHeader><h2 hlmCardTitle>Notable Incidents</h2></div>
          <div hlmCardContent>
            <app-incident-timeline [vehicleId]="vehicleId()" />
          </div>
        </div>

        <!-- Density cap: see vehicleDetailBetweenCardsSlotId — footerEnd + this = 2 (max). -->
        <app-ad-slot
          [slotId]="vehicleDetailBetweenCardsSlotId"
          [minHeightPx]="250"
          [label]="'Advertisement'"
        />

        <div hlmCard>
          <div hlmCardHeader><h2 hlmCardTitle>Spotting History</h2></div>
          <div hlmCardContent>
            <app-spotting-history [vehicleId]="vehicleId()" />
          </div>
        </div>
      }
    </div>
  `,
})
export class VehicleDetailPage {
  readonly lineId = input.required<string>();
  readonly vehicleId = input.required<string>();

  protected readonly linesStore = inject(SpottingLinesStore);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly isBrowser = injectIsBrowser();

  // Density cap: this page state already gets `footerEnd` from spotting-shell (it wraps every
  // /spotting/** child route) — with this between-cards unit that's 2, the per-page maximum.
  protected readonly vehicleDetailBetweenCardsSlotId = resolveAdSlot("vehicleDetailBetweenCards");

  protected readonly _lineCode = computed(
    () => this.linesStore.lineById(this.lineId())?.code ?? this.lineId(),
  );

  protected readonly vehicleResource = graphqlResource<
    VehicleHeaderQueryData,
    VehicleHeaderQueryVars
  >(() => ({
    query: VEHICLE_HEADER_QUERY,
    variables: { vehicleId: this.vehicleId() },
  }));

  protected readonly _vehicle = computed(() => this.vehicleResource.data()?.vehicles[0]);

  /** The backend answered and has no such vehicle. `data()` is `undefined` while a request is in
   * flight (including the moment `vehicleId()` changes) and `hasError()` covers a failed one, so
   * neither reads as "not found". */
  protected readonly _isNotFound = computed(
    () => this.vehicleResource.data()?.vehicles.length === 0,
  );

  protected readonly _showDetails = computed(
    () => !this.vehicleResource.hasError() && !this._isNotFound(),
  );

  /** Only the vehicle-switcher combobox reads the line roster, so it loads in the browser only:
   * SSR neither waits for it nor ships it in TransferState. */
  private readonly vehicleTypesResource = graphqlResource<
    VehicleTypesQueryData,
    VehicleTypesQueryVars
  >(() =>
    this.isBrowser
      ? { query: VEHICLE_TYPES_QUERY, variables: { lineId: this.lineId() } }
      : undefined,
  );

  private readonly _vehicleTypes = computed(
    () => this.vehicleTypesResource.data()?.vehicleTypes ?? [],
  );

  protected readonly _allVehiclesForLine = computed(() =>
    [...this._vehicleTypes().flatMap((t) => t.vehicles)].sort((a, b) =>
      a.identificationNo.localeCompare(b.identificationNo, undefined, { numeric: true }),
    ),
  );

  /** Until the browser-only roster arrives, the switcher offers just this vehicle, so it already
   * shows the right label (on the server too). */
  protected readonly vehicleItems = computed<ComboboxItem<string>[]>(() => {
    const roster = this._allVehiclesForLine();
    const current = this._vehicle();
    return (roster.length > 0 ? roster : current ? [current] : []).map((v) => ({
      label: v.identificationNo,
      value: v.id,
      meta: { status: v.status },
    }));
  });

  private readonly spottingHistoryResource = graphqlResource<
    VehicleSpottingHistoryQueryData,
    VehicleSpottingHistoryQueryVars
  >(() => ({
    query: VEHICLE_SPOTTING_HISTORY_QUERY,
    variables: { vehicleId: this.vehicleId() },
  }));

  private readonly _rawSpottings = computed(
    () => this.spottingHistoryResource.data()?.vehicles[0]?.spottings ?? [],
  );

  /** Buckets this vehicle's own raw spottings into one point per (day, type) — see the query's
   * doc comment for why this is computed here rather than asked of the backend. */
  protected readonly _vehicleTrends = computed<SpottingActivityPoint[]>(() =>
    toSpottingActivityPoints(this._rawSpottings()),
  );

  /** Appended to the "Spotting Activity" heading — the heatmap below already covers the whole
   * year, but "today" specifically isn't otherwise visible at a glance without hovering the
   * one cell for it. */
  protected readonly _todaySpottingsCount = computed(() => {
    const today = dateKeyOf(new Date());
    return this._rawSpottings().filter((s) => s.spottingDate === today).length;
  });

  constructor() {
    // Refresh retained page data after returning from outside the vehicle route.
    revalidateOnReturn(isSpottingVehicleRoute, () => {
      this.vehicleResource.reload();
      this.vehicleTypesResource.reload();
      this.spottingHistoryResource.reload();
    });

    effect(() => {
      // Only an answered-and-empty query (`_isNotFound`) means "this vehicle doesn't exist". A fetch
      // that is still in flight, or failed, isn't — the template's own retry banner covers the
      // failure, and neither is a reason to redirect someone away from a link that may well be
      // perfectly valid.
      if (this._isNotFound() && this.isBrowser) {
        // Browser-only — see the identical guard/comment in line-overview.page.ts's own
        // not-found effect: this same navigate() during SSR hangs the render entirely.
        // untracked: toast.error() reads, then rewrites, the toast list. Tracked, that write
        // re-runs this effect, which raises another toast, forever — the tab froze solid.
        untracked(() => {
          this.toast.error(
            "Vehicle not found",
            "It may have been removed, or the link is out of date.",
          );
          this.router.navigate(["/spotting", this.lineId()], { replaceUrl: true });
        });
      }
    });
  }

  protected onSwitchVehicle(vehicleId: string | undefined): void {
    if (vehicleId) {
      this.router.navigate(["/spotting", this.lineId(), "vehicle", vehicleId]);
    }
  }
}
