import { Component, PLATFORM_ID, computed, effect, inject, input } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { Router, RouterLink } from "@angular/router";
import { graphqlResource } from "../../../core/graphql/graphql-client";
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
import {
    VEHICLE_SPOTTING_HISTORY_QUERY,
    VEHICLE_TYPES_QUERY,
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
 */
@Component({
    selector: "app-vehicle-detail",
    imports: [
        RouterLink,
        HlmSkeleton,
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
        @if (vehicleTypesResource.isLoading()) {
            <div class="flex flex-col gap-4">
                <div hlmSkeleton class="h-6 w-48"></div>
                <div hlmSkeleton class="h-24 w-full"></div>
            </div>
        } @else if (vehicleTypesResource.hasError()) {
            <app-retry-banner [resource]="vehicleTypesResource" message="Couldn't load this vehicle." />
        } @else if (_vehicle(); as vehicle) {
            <div class="flex flex-col gap-6">
                <nav class="flex items-center gap-1.5 text-sm">
                    <a [routerLink]="['/spotting', lineId()]" class="text-muted-foreground hover:text-foreground hover:underline">
                        {{ _lineCode() }}
                    </a>
                    <span class="text-muted-foreground">/</span>
                    <span class="text-muted-foreground">Vehicle</span>
                    <span class="text-muted-foreground">/</span>
                    <hlm-combobox
                        class="field-sizing-content !border-none !bg-transparent !py-0.5 !pl-0 !font-medium"
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
                        <h2 hlmCardTitle>Spotting Activity — {{ _todaySpottingsCount() }} spotting{{ _todaySpottingsCount() === 1 ? "" : "s" }} today</h2>
                    </div>
                    <div hlmCardContent>
                        <spotting-activity-heatmap [data]="_vehicleTrends()" [totalAllTime]="vehicle.spottingCount" />
                    </div>
                </div>

                <div hlmCard>
                    <div hlmCardHeader><h2 hlmCardTitle>Notable Incidents</h2></div>
                    <div hlmCardContent>
                        <app-incident-timeline [vehicleId]="vehicleId()" />
                    </div>
                </div>

                <div hlmCard>
                    <div hlmCardHeader><h2 hlmCardTitle>Spotting History</h2></div>
                    <div hlmCardContent>
                        <app-spotting-history [vehicleId]="vehicleId()" />
                    </div>
                </div>
            </div>
        }
    `,
})
export class VehicleDetailPage {
    readonly lineId = input.required<string>();
    readonly vehicleId = input.required<string>();

    protected readonly linesStore = inject(SpottingLinesStore);
    private readonly router = inject(Router);
    private readonly toast = inject(ToastService);
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

    protected readonly _lineCode = computed(() => this.linesStore.lineById(this.lineId())?.code ?? this.lineId());

    protected readonly vehicleTypesResource = graphqlResource<VehicleTypesQueryData, VehicleTypesQueryVars>(() => ({
        query: VEHICLE_TYPES_QUERY,
        variables: { lineId: this.lineId() },
    }));

    private readonly _vehicleTypes = computed(() => this.vehicleTypesResource.data()?.vehicleTypes ?? []);

    protected readonly _allVehiclesForLine = computed(() =>
        [...this._vehicleTypes().flatMap((t) => t.vehicles)].sort((a, b) =>
            a.identificationNo.localeCompare(b.identificationNo, undefined, { numeric: true })
        )
    );

    protected readonly _vehicle = computed(() =>
        this._allVehiclesForLine().find((v) => v.id === this.vehicleId())
    );

    protected readonly vehicleItems = computed<ComboboxItem<string>[]>(() =>
        this._allVehiclesForLine().map((v) => ({ label: v.identificationNo, value: v.id, meta: { status: v.status } }))
    );

    private readonly spottingHistoryResource = graphqlResource<VehicleSpottingHistoryQueryData, VehicleSpottingHistoryQueryVars>(
        () => ({
            query: VEHICLE_SPOTTING_HISTORY_QUERY,
            variables: { vehicleId: this.vehicleId() },
        })
    );

    private readonly _rawSpottings = computed(() => this.spottingHistoryResource.data()?.vehicles[0]?.spottings ?? []);

    /** Buckets this vehicle's own raw spottings into one point per (day, type) — see the query's
     * doc comment for why this is computed here rather than asked of the backend. */
    protected readonly _vehicleTrends = computed<SpottingActivityPoint[]>(() => toSpottingActivityPoints(this._rawSpottings()));

    /** Appended to the "Spotting Activity" heading — the heatmap below already covers the whole
     * year, but "today" specifically isn't otherwise visible at a glance without hovering the
     * one cell for it. */
    protected readonly _todaySpottingsCount = computed(() => {
        const today = dateKeyOf(new Date());
        return this._rawSpottings().filter((s) => s.spottingDate === today).length;
    });

    constructor() {
        effect(() => {
            // A fetch error isn't "this vehicle doesn't exist" — that's a fetch-level `hasError()`
            // guard on the template's own retry banner to work out, not a reason to redirect
            // someone away from a link that may well be perfectly valid.
            if (this.vehicleTypesResource.isLoading() || this.vehicleTypesResource.hasError()) {
                return;
            }
            if (!this._vehicle() && this.isBrowser) {
                // Browser-only — see the identical guard/comment in line-overview.page.ts's own
                // not-found effect: this same navigate() during SSR hangs the render entirely.
                this.toast.error("Vehicle not found", "It may have been removed, or the link is out of date.");
                this.router.navigate(["/spotting", this.lineId()], { replaceUrl: true });
            }
        });
    }

    protected onSwitchVehicle(vehicleId: string | undefined): void {
        if (vehicleId) {
            this.router.navigate(["/spotting", this.lineId(), "vehicle", vehicleId]);
        }
    }
}
