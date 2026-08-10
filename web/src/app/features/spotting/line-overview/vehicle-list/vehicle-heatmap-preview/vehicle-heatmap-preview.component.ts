import { Component, computed, input } from "@angular/core";
import { graphqlResource } from "../../../../../core/graphql/graphql-client";
import { HlmSkeleton } from "../../../../../ui/skeleton/skeleton";
import { RetryBannerComponent } from "../../../../../ui/retry-banner/retry-banner.component";
import {
    SpottingActivityHeatmap,
    toSpottingActivityPoints,
} from "../../../../../domain-ui/spotting-activity-heatmap/spotting-activity-heatmap";
import {
    VEHICLE_SPOTTING_HISTORY_QUERY,
    VehicleSpottingHistoryQueryData,
    VehicleSpottingHistoryQueryVars,
} from "../../../data/spotting.queries";

/**
 * The hover-card content for a vehicle-list row's name (desktop only — see the `brnHoverCardTriggerFor`
 * usage in vehicle-list.component.ts). Only ever instantiated once a row is actually hovered — the
 * hover-card's content template isn't rendered until the overlay opens, so this component (and the
 * resource it owns) never fetches anything for the other N-1 rows in the list that weren't hovered.
 *
 * Deliberately its own component rather than inline in vehicle-list.component.ts: each row needs its
 * own independent fetch/loading state, and a component boundary is what makes that resource's
 * lifetime (created on hover, destroyed when the hover-card's content is torn down) match the
 * overlay's own lifetime for free.
 */
@Component({
    selector: "app-vehicle-heatmap-preview",
    imports: [HlmSkeleton, RetryBannerComponent, SpottingActivityHeatmap],
    template: `
        <!-- w-[960px]: wide enough to clear spotting-activity-heatmap's own classicLayoutMinWidth
             (weeks-as-columns, the actual "github/gitlab style" look) at a full year's ~53 weeks —
             narrower than that and it silently falls back to the compact auto-fill grid instead,
             which stacks into a tall, square block rather than the wide, short calendar strip this
             is meant to look like. max-h-96/overflow-y-auto stays on as a safety net for whatever
             layout actually renders, not because the classic one is expected to need it. -->
        <div class="bg-popover text-popover-foreground border-border max-h-96 w-[960px] overflow-y-auto rounded-lg border p-3 shadow-md">
            @if (resource.isLoading()) {
                <div hlmSkeleton class="h-28 w-full"></div>
            } @else if (resource.hasError()) {
                <app-retry-banner [resource]="resource" message="Couldn't load this vehicle's activity." />
            } @else {
                <spotting-activity-heatmap [data]="_trends()" [totalAllTime]="totalAllTime()" [hideYearPicker]="true" />
            }
        </div>
    `,
})
export class VehicleHeatmapPreviewComponent {
    readonly vehicleId = input.required<string>();
    /** All-time spotting count for this vehicle — already known by the row that triggers this
     * preview, so it's passed straight through instead of being re-derived from the fetch below. */
    readonly totalAllTime = input.required<number>();

    protected readonly resource = graphqlResource<VehicleSpottingHistoryQueryData, VehicleSpottingHistoryQueryVars>(() => ({
        query: VEHICLE_SPOTTING_HISTORY_QUERY,
        variables: { vehicleId: this.vehicleId() },
    }));

    protected readonly _trends = computed(() => toSpottingActivityPoints(this.resource.data()?.vehicles[0]?.spottings ?? []));
}
