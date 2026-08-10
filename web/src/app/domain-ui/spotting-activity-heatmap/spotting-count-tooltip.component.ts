import { Component, input } from "@angular/core";
import { SpottingType } from "../../core/graphql/types";
import { SpottingTypeBadge } from "../spotting-type-badge/spotting-type-badge";

export interface SpottingTypeCount {
    type: SpottingType;
    count: number;
}

/**
 * The GitHub/GitLab-style "day cell" popover — one date's spotting count, optionally broken down
 * by type. Originally lived inline in SpottingActivityHeatmap's own template; pulled out so
 * VehicleSpottingGridComponent's per-vehicle×date cells (line-details' own grid) can show the
 * exact same popover rather than a hand-rolled lookalike — one visual definition of "what a
 * spotting-count tooltip looks like" for both heatmaps in the app.
 */
@Component({
    selector: "app-spotting-count-tooltip",
    imports: [SpottingTypeBadge],
    template: `
        <div
            class="bg-popover text-popover-foreground border-border pointer-events-none absolute left-1/2 z-20 w-max -translate-x-1/2 rounded-lg border p-2 text-xs shadow-md"
            [class]="above() ? 'bottom-full mb-1.5' : 'top-full mt-1.5'"
        >
            @if (label()) {
                <p class="font-medium whitespace-nowrap">{{ label() }}</p>
            }
            <p class="font-medium whitespace-nowrap" [class.mb-1]="breakdown().length > 0">
                {{ dateKey() }} · {{ count() }} spotting{{ count() === 1 ? "" : "s" }}
            </p>
            @if (breakdown().length > 0) {
                <div class="flex flex-col gap-1">
                    @for (entry of breakdown(); track entry.type) {
                        <div class="flex items-center justify-between gap-2">
                            <spotting-type-badge [type]="entry.type" />
                            <span>{{ entry.count }}</span>
                        </div>
                    }
                </div>
            }
        </div>
    `,
})
export class SpottingCountTooltipComponent {
    /** Optional context line above the date — e.g. a vehicle's identification number, when the
     * grid this sits in covers more than one entity (a lone heatmap doesn't need this). */
    readonly label = input<string | null>(null);
    readonly dateKey = input.required<string>();
    readonly count = input.required<number>();
    readonly breakdown = input<SpottingTypeCount[]>([]);
    /** Whether this pops above or below its anchor cell — the host decides based on measured
     * room (see spotting-activity-heatmap.ts's / vehicle-spotting-grid.component.ts's own
     * `onHoverStart`), not something this purely-presentational component can know on its own. */
    readonly above = input(true);
}
