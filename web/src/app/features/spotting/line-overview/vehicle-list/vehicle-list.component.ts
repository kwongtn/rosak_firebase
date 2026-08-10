import { Component, DestroyRef, ElementRef, computed, effect, inject, input, output, signal, viewChild } from "@angular/core";
import { RouterLink } from "@angular/router";
import { DatePipe } from "@angular/common";
import { BrnHoverCardImports } from "@spartan-ng/brain/hover-card";
import { HlmCardImports } from "../../../../ui/card/card";
import { HlmTableImports } from "../../../../ui/table/table";
import { VehicleStatusBadge } from "../../../../domain-ui/vehicle-status-badge/vehicle-status-badge";
import { WheelStatusBadge } from "../../../../domain-ui/wheel-status-badge/wheel-status-badge";
import { VehicleStatus } from "../../../../core/graphql/types";
import { VehicleType } from "../../data/spotting.queries";
import { FleetSummaryComponent } from "../fleet-summary/fleet-summary.component";
import { VehicleHeatmapPreviewComponent } from "./vehicle-heatmap-preview/vehicle-heatmap-preview.component";

type SortColumn = "identificationNo" | "status" | "wheelStatus" | "lastSpottingDate" | "inServiceSince" | "spottingCount" | "notes";
type SortDirection = "asc" | "desc";

interface ColumnDef {
    key: SortColumn;
    label: string;
}

const COLUMNS: ColumnDef[] = [
    { key: "identificationNo", label: "Vehicle" },
    { key: "status", label: "Status" },
    { key: "wheelStatus", label: "Wheel" },
    { key: "lastSpottingDate", label: "Last Spotted" },
    { key: "inServiceSince", label: "In Service Since" },
    { key: "spottingCount", label: "Times Spotted" },
    { key: "notes", label: "Notes" },
];

/**
 * A vehicle type's fleet roster. Renders a table on wider viewports and a card list below the
 * `sm` breakpoint, rather than the old app's fixed 1330px-wide horizontally-scrolling table
 * (see the redesign rationale in the rewrite plan / spotting.md Known Quirks). Sorted by
 * vehicle ID by default; every column header is clickable to re-sort.
 *
 * The header is sticky (stacking below both the sticky app-nav bar and the line-overview page's
 * own sticky line-name bar, at `stickyOffset()` — the *measured* height of both, passed down
 * from line-overview.page.ts rather than a hardcoded guess, since that bar's own height isn't
 * fixed) and collapses the *entire* roster below it — table, mobile cards, all of it — leaving
 * just the title plus a compact inline status summary. There's deliberately no chevron/arrow
 * hinting that the title is clickable — the whole affordance is the hover state on the title
 * button itself, discoverable rather than advertised.
 *
 * The desktop table's own column-header row is sticky too, right below this card's header block
 * (`stickyOffset() + headerHeight()`, headerHeight likewise measured) — so scrolling through a
 * long roster never loses sight of which column is which, stacking a third sticky layer on top
 * of app-nav and the line-name bar. This card does *not* own its own bounded/internally-scrolling
 * region — the whole roster flows in the page's own scroll, with these two bars floating over it;
 * a bounded `overflow-y-auto` card was tried and reverted (broke both the anchoring itself and
 * felt worse to use than the page just scrolling through).
 *
 * The outer card is a single, ordinary `HlmCard` shell — one border, one shadow, one rounded box,
 * same as any other card in this app. Only its own padding/gap are zeroed (`gap-0 p-0`) so the
 * header and the (conditional) body below it can each own a flush `p-5` and sit truly edge-to-edge
 * with that one shell, rather than the header adding a *second*, separate bordered frame around
 * itself — a card-inside-a-card reads as clutter, not as "this part is stuck." The header still
 * needs its own explicit `bg-card` (the outer shell's background alone won't do — a sticky
 * element's box is repainted in place as the page scrolls, so without its own opaque background
 * the body rows scrolling underneath would show through it), and it keeps whichever end's rounded
 * corner it's currently touching (`rounded-t-xl` always; `rounded-b-xl` too once collapsed, so it's
 * the whole shell). Deliberately not `overflow-hidden` on the outer card to make the header's
 * edge-to-edge alignment foolproof instead: `overflow` values other than `visible` make an
 * element the reference scroll-container for `position: sticky` descendants, and this card's own
 * box never scrolls internally (the page does) — that would silently neutralize the header's
 * stickiness entirely.
 */
@Component({
    selector: "app-vehicle-list",
    imports: [
        RouterLink,
        DatePipe,
        ...HlmCardImports,
        ...HlmTableImports,
        ...BrnHoverCardImports,
        VehicleStatusBadge,
        WheelStatusBadge,
        FleetSummaryComponent,
        VehicleHeatmapPreviewComponent,
    ],
    template: `
        @if (_sortedVehicles().length > 0) {
            <div hlmCard class="gap-0 p-0">
                <div
                    #headerRow
                    class="bg-card sticky z-10 flex flex-col gap-2 rounded-t-xl p-4"
                    [style.top.px]="stickyOffset()"
                    [class.pb-2]="isExpanded()"
                    [class.rounded-b-xl]="!isExpanded()"
                >
                    <div class="flex items-center justify-between gap-2">
                        <button
                            type="button"
                            class="hover:text-muted-foreground flex flex-1 flex-wrap items-center gap-2 text-left"
                            (click)="isExpanded.set(!isExpanded())"
                        >
                            <h3 hlmCardTitle>{{ vehicleType().displayName }}</h3>
                            @if (!isExpanded()) {
                                <!-- stopPropagation: the compact chips below are real, clickable
                                     <button>s (see FleetSummaryComponent) sitting inside this
                                     title button's own click target — without this, selecting a
                                     status filter from a collapsed card would also toggle the
                                     card open/closed as the click bubbles up. -->
                                <span (click)="$event.stopPropagation()">
                                    <app-fleet-summary
                                        [vehicleTypes]="[vehicleType()]"
                                        [compact]="true"
                                        [activeStatus]="statusFilter()"
                                        (statusSelected)="statusSelected.emit($event)"
                                    />
                                </span>
                            }
                        </button>
                        @if (isExpanded()) {
                            <button
                                type="button"
                                class="text-muted-foreground hover:text-foreground shrink-0 text-xs underline sm:hidden"
                                (click)="showFullTable.set(!showFullTable())"
                            >
                                {{ showFullTable() ? "View as cards" : "View full table" }}
                            </button>
                        }
                    </div>
                    @if (isExpanded()) {
                        <app-fleet-summary
                            [vehicleTypes]="[vehicleType()]"
                            [activeStatus]="statusFilter()"
                            (statusSelected)="statusSelected.emit($event)"
                        />
                    }
                </div>

                @if (isExpanded()) {
                    <div class="rounded-b-xl p-4 pt-0">
                        <!-- Desktop table, always shown at sm+; on mobile only when "View full table"
                             is on, in which case it needs a floor width to stay legible rather than
                             squishing seven columns into the viewport — hence the horizontal scroll
                             only in that state. Deliberately not the shared hlmTableContainer
                             directive here, which hardcodes overflow-x-auto unconditionally: any
                             non-visible overflow on an ancestor — even one that never actually
                             overflows — becomes the containing block for position:sticky
                             descendants (a real, spec-mandated CSS rule, not a bug to work around
                             per-browser), which is exactly what was silently breaking the column
                             header's sticky-against-the-page behavior below. Only entering that
                             overflow state in the one case that actually needs horizontal scroll
                             keeps the far more common desktop path sticky-safe. -->
                        <div class="relative w-full" [class]="showFullTable() ? 'block overflow-x-auto' : 'hidden sm:block'">
                            <table hlmTable [class]="showFullTable() ? 'min-w-[700px]' : ''">
                                <thead hlmTHead>
                                    <tr hlmTr class="bg-card sticky z-[5]" [style.top.px]="stickyOffset() + headerHeight()">
                                        @for (column of columns; track column.key) {
                                            <th hlmTh>
                                                <button
                                                    type="button"
                                                    class="flex items-center gap-1 hover:underline"
                                                    (click)="toggleSort(column.key)"
                                                >
                                                    {{ column.label }}
                                                    @if (sortColumn() === column.key) {
                                                        <span class="text-xs">{{ sortDirection() === "asc" ? "▲" : "▼" }}</span>
                                                    }
                                                </button>
                                            </th>
                                        }
                                    </tr>
                                </thead>
                                <tbody hlmTBody>
                                    @for (vehicle of _sortedVehicles(); track vehicle.id) {
                                        <tr hlmTr>
                                            <td hlmTd class="py-3" brnHoverCard>
                                                <a
                                                    [routerLink]="['vehicle', vehicle.id]"
                                                    class="hover:underline"
                                                    [brnHoverCardTriggerFor]="heatmapPreviewTpl"
                                                    [showDelay]="2000"
                                                >
                                                    {{ vehicle.identificationNo }}
                                                </a>
                                                <ng-template #heatmapPreviewTpl>
                                                    <app-vehicle-heatmap-preview [vehicleId]="vehicle.id" [totalAllTime]="vehicle.spottingCount" />
                                                </ng-template>
                                                @if (vehicle.nickname) {
                                                    <div class="text-muted-foreground text-xs">{{ vehicle.nickname }}</div>
                                                }
                                            </td>
                                            <td hlmTd class="py-3"><vehicle-status-badge [status]="vehicle.status" /></td>
                                            <td hlmTd class="py-3"><wheel-status-badge [status]="vehicle.wheelStatus" /></td>
                                            <td hlmTd class="py-3">{{ vehicle.lastSpottingDate ? (vehicle.lastSpottingDate | date) : "—" }}</td>
                                            <td hlmTd class="py-3">{{ vehicle.inServiceSince ? (vehicle.inServiceSince | date) : "—" }}</td>
                                            <td hlmTd class="py-3">{{ vehicle.spottingCount }}</td>
                                            <td hlmTd class="max-w-48 py-3">
                                                <span class="line-clamp-3" [title]="vehicle.notes ?? ''">{{ vehicle.notes || "—" }}</span>
                                            </td>
                                        </tr>
                                    }
                                </tbody>
                            </table>
                        </div>

                        <!-- Mobile cards: vehicle, status, wheel, last spotted, notes — the fields
                             that matter at a glance; times-spotted is skipped here (still on the
                             desktop table) since it isn't useful without a time window to compare against. -->
                        <div [class]="showFullTable() ? 'hidden' : 'flex flex-col gap-3 sm:hidden'">
                            @for (vehicle of _sortedVehicles(); track vehicle.id) {
                                <a [routerLink]="['vehicle', vehicle.id]" hlmCard class="gap-2 p-3">
                                    <div class="flex items-center justify-between gap-2">
                                        <span class="font-medium">{{ vehicle.identificationNo }}</span>
                                        <div class="flex items-center gap-1.5">
                                            <vehicle-status-badge [status]="vehicle.status" />
                                            <wheel-status-badge [status]="vehicle.wheelStatus" />
                                        </div>
                                    </div>
                                    @if (vehicle.nickname) {
                                        <div class="text-muted-foreground text-xs">{{ vehicle.nickname }}</div>
                                    }
                                    <div class="text-muted-foreground text-xs">
                                        Last spotted {{ vehicle.lastSpottingDate ? (vehicle.lastSpottingDate | date) : "—" }}
                                    </div>
                                    @if (vehicle.notes) {
                                        <p class="text-muted-foreground line-clamp-2 text-xs">{{ vehicle.notes }}</p>
                                    }
                                </a>
                            }
                        </div>
                    </div>
                }
            </div>
        }
    `,
})
export class VehicleListComponent {
    readonly vehicleType = input.required<VehicleType>();
    readonly statusFilter = input<VehicleStatus | null>(null);
    readonly statusSelected = output<VehicleStatus | null>();
    /** Where this card's own header should stick — the parent (line-overview.page.ts) measures
     * its own sticky bars' real height and passes the total down, rather than this guessing a
     * constant that drifts out of sync whenever those bars grow (see line-overview's own
     * `stickyBarHeight` doc comment for the exact bug that caused). */
    readonly stickyOffset = input(117);

    protected readonly columns = COLUMNS;
    protected readonly sortColumn = signal<SortColumn>("identificationNo");
    protected readonly sortDirection = signal<SortDirection>("asc");
    /** Lets a mobile user opt into the desktop table (horizontally scrollable) instead of cards,
     * when they want every column at once rather than the at-a-glance summary. */
    protected readonly showFullTable = signal(false);
    /** Expanded by default — the full, clickable-to-filter status row and vehicle roster.
     * Collapsing leaves just the title plus a compact inline status summary. */
    protected readonly isExpanded = signal(true);

    /** This card's own header block's real rendered height — the table's column-header row
     * sticks right below it, and that block's height varies (collapsed vs expanded, whether the
     * compact fleet-summary/status-chips row wraps), so it's measured rather than guessed. */
    private readonly headerRow = viewChild("headerRow", { read: ElementRef });
    protected readonly headerHeight = signal(0);
    private headerObserver: ResizeObserver | undefined;

    constructor() {
        const destroyRef = inject(DestroyRef);
        effect(() => {
            const ref = this.headerRow();
            this.headerObserver?.disconnect();
            this.headerObserver = undefined;
            if (!ref || typeof ResizeObserver === "undefined") {
                return;
            }
            const observer = new ResizeObserver(([entry]) => {
                const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
                if (height > 0) {
                    this.headerHeight.set(height);
                }
            });
            observer.observe(ref.nativeElement);
            this.headerObserver = observer;
        });
        destroyRef.onDestroy(() => this.headerObserver?.disconnect());
    }

    protected readonly _sortedVehicles = computed(() => {
        const filter = this.statusFilter();
        const vehicles = this.vehicleType().vehicles;
        const rows = filter ? vehicles.filter((v) => v.status === filter) : vehicles;

        const column = this.sortColumn();
        const dir = this.sortDirection() === "asc" ? 1 : -1;

        return [...rows].sort((a, b) => {
            const av = a[column];
            const bv = b[column];
            if (av == null && bv == null) return 0;
            if (av == null) return 1;
            if (bv == null) return -1;
            if (typeof av === "number" && typeof bv === "number") {
                return (av - bv) * dir;
            }
            return String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir;
        });
    });

    protected toggleSort(column: SortColumn): void {
        if (this.sortColumn() === column) {
            this.sortDirection.update((d) => (d === "asc" ? "desc" : "asc"));
        } else {
            this.sortColumn.set(column);
            this.sortDirection.set("asc");
        }
    }
}
