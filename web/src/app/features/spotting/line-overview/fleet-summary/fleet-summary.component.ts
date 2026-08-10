import { Component, computed, input, output } from "@angular/core";
import { HlmButton } from "../../../../ui/button/button";
import { VehicleStatus } from "../../../../core/graphql/types";
import { VehicleType } from "../../data/spotting.queries";

interface SummaryChip {
    key: VehicleStatus | null;
    label: string;
    count: number;
    percent: string;
    activeClass: string;
    inactiveClass: string;
}

const CHIP_STYLE: Record<string, { active: string; inactive: string }> = {
    TOTAL: {
        active: "bg-foreground text-background border-transparent",
        inactive: "bg-transparent text-foreground border-border hover:bg-muted",
    },
    IN_SERVICE: {
        active: "bg-emerald-600 text-white border-transparent",
        inactive: "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
    },
    NOT_SPOTTED: {
        active: "bg-amber-600 text-white border-transparent",
        inactive: "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
    },
    OUT_OF_SERVICE: {
        active: "bg-red-600 text-white border-transparent",
        inactive: "bg-red-50 text-red-800 border-red-200 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900",
    },
    DECOMMISSIONED: {
        active: "bg-neutral-600 text-white border-transparent",
        inactive: "bg-neutral-50 text-neutral-700 border-neutral-200 hover:bg-neutral-100 dark:bg-neutral-900 dark:text-neutral-300 dark:border-neutral-800",
    },
    MARRIED: {
        active: "bg-purple-600 text-white border-transparent",
        inactive: "bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900",
    },
    TESTING: {
        active: "bg-blue-600 text-white border-transparent",
        inactive: "bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900",
    },
    UNKNOWN: {
        active: "bg-slate-600 text-white border-transparent",
        inactive: "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800",
    },
};

/**
 * Page-wide "Total: N | In Service: N | ..." chip row, aggregated across every vehicle type on
 * the line. Each chip is colored by status and clickable — selecting one filters the vehicle
 * lists below to that status; selecting it again (or "Total") clears the filter.
 */
@Component({
    selector: "app-fleet-summary",
    imports: [HlmButton],
    template: `
        @if (compact()) {
            <!-- Tighter chips for a collapsed header — same colors, same active-status highlight,
                 and same click-to-filter/toggle behavior as the full row below, just at a smaller
                 size. This used to be read-only plain <span>s that always showed the unfiltered
                 counts regardless of activeStatus() — meaning a filter selected via the full row
                 further down the page silently stopped being reflected (or toggleable) the moment
                 this compact copy took over in the merged sticky header. -->
            <div class="flex flex-wrap items-center gap-1.5 text-xs">
                @for (chip of _chips(); track chip.label) {
                    <button
                        type="button"
                        class="rounded-full border px-2 py-0.5 transition-colors"
                        [class]="activeStatus() === chip.key ? chip.activeClass : chip.inactiveClass"
                        [title]="chip.percent + '% of fleet'"
                        (click)="statusSelected.emit(activeStatus() === chip.key ? null : chip.key)"
                    >
                        {{ chip.label }}: {{ chip.count }}
                    </button>
                }
            </div>
        } @else {
            <div class="flex flex-wrap items-center gap-2">
                @if (_totalChip(); as total) {
                    <button
                        hlmBtn
                        variant="outline"
                        size="sm"
                        class="rounded-full border transition-colors"
                        [class]="activeStatus() === total.key ? total.activeClass : total.inactiveClass"
                        [title]="total.percent + '% of fleet'"
                        (click)="statusSelected.emit(activeStatus() === total.key ? null : total.key)"
                    >
                        {{ total.label }}: {{ total.count }}
                    </button>
                    <div class="bg-border h-5 w-px" aria-hidden="true"></div>
                }
                @for (chip of _statusChips(); track chip.label) {
                    <button
                        hlmBtn
                        variant="outline"
                        size="sm"
                        class="rounded-full border transition-colors"
                        [class]="activeStatus() === chip.key ? chip.activeClass : chip.inactiveClass"
                        [title]="chip.percent + '% of fleet'"
                        (click)="statusSelected.emit(activeStatus() === chip.key ? null : chip.key)"
                    >
                        {{ chip.label }}: {{ chip.count }}
                    </button>
                }
            </div>
        }
    `,
})
export class FleetSummaryComponent {
    readonly vehicleTypes = input.required<VehicleType[]>();
    readonly activeStatus = input<VehicleStatus | null>(null);
    /** Collapsed-header mode: plain, non-interactive chips, no Total/rest divider. */
    readonly compact = input(false);
    readonly statusSelected = output<VehicleStatus | null>();

    protected readonly _totalChip = computed<SummaryChip | undefined>(() => this._chips()[0]);
    protected readonly _statusChips = computed<SummaryChip[]>(() => this._chips().slice(1));

    protected readonly _chips = computed<SummaryChip[]>(() => {
        const types = this.vehicleTypes();
        const total = types.reduce((sum, t) => sum + t.vehicleTotalCount, 0);

        const totals: Array<{ key: VehicleStatus; label: string; count: number }> = [
            { key: "IN_SERVICE", label: "In Service", count: types.reduce((sum, t) => sum + t.vehicleStatusInServiceCount, 0) },
            { key: "NOT_SPOTTED", label: "Not Spotted", count: types.reduce((sum, t) => sum + t.vehicleStatusNotSpottedCount, 0) },
            { key: "OUT_OF_SERVICE", label: "Out of Service", count: types.reduce((sum, t) => sum + t.vehicleStatusOutOfServiceCount, 0) },
            { key: "DECOMMISSIONED", label: "Decommissioned", count: types.reduce((sum, t) => sum + t.vehicleStatusDecommissionedCount, 0) },
            { key: "MARRIED", label: "Married", count: types.reduce((sum, t) => sum + t.vehicleStatusMarriedCount, 0) },
            { key: "TESTING", label: "Testing", count: types.reduce((sum, t) => sum + t.vehicleStatusTestingCount, 0) },
            { key: "UNKNOWN", label: "Unknown", count: types.reduce((sum, t) => sum + t.vehicleStatusUnknownCount, 0) },
        ];

        const chips: SummaryChip[] = [
            {
                key: null,
                label: "Total",
                count: total,
                percent: "100",
                activeClass: CHIP_STYLE["TOTAL"].active,
                inactiveClass: CHIP_STYLE["TOTAL"].inactive,
            },
        ];
        for (const { key, label, count } of totals) {
            if (count > 0) {
                chips.push({
                    key,
                    label,
                    count,
                    percent: total === 0 ? "0" : ((count / total) * 100).toPrecision(3),
                    activeClass: CHIP_STYLE[key].active,
                    inactiveClass: CHIP_STYLE[key].inactive,
                });
            }
        }
        return chips;
    });
}
