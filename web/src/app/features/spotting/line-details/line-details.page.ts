import { Component, DestroyRef, ElementRef, computed, effect, inject, input, signal, viewChild } from "@angular/core";
import { RouterLink } from "@angular/router";
import { graphqlResource } from "../../../core/graphql/graphql-client";
import { observeHeight } from "../../../core/dom/observe-height";
import { HlmButton } from "../../../ui/button/button";
import { HlmSkeleton } from "../../../ui/skeleton/skeleton";
import { RetryBannerComponent } from "../../../ui/retry-banner/retry-banner.component";
import { LineStatusBadge } from "../../../domain-ui/line-status-badge/line-status-badge";
import { VehicleStatus } from "../../../core/graphql/types";
import { SpottingLinesStore } from "../data/spotting-lines.store";
import {
    LINE_SPOTTING_BOUNDS_QUERY,
    LineSpottingBoundsQueryData,
    LineSpottingBoundsQueryVars,
    VEHICLE_TYPES_QUERY,
    VehicleTypesQueryData,
    VehicleTypesQueryVars,
} from "../data/spotting.queries";
import { FleetSummaryComponent } from "../line-overview/fleet-summary/fleet-summary.component";
import { VehicleSpottingGridComponent } from "./vehicle-spotting-grid/vehicle-spotting-grid.component";
import { StationAssetsSectionComponent } from "./station-assets-section/station-assets-section.component";
import { VehicleStatusTrendComponent } from "./vehicle-status-trend/vehicle-status-trend.component";

/** How far back to look for the earliest month with any real data — generous rather than exact;
 * a line whose actual history starts later than this just reports every earlier month as having
 * no data too, which still correctly greys out "back" once there's truly nothing further. */
const BOUNDS_FLOOR = "2015-01-01";

function firstOfMonth(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addMonths(date: Date, delta: number): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1));
}

function monthKey(date: Date): string {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

const MONTH_LABEL = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const MONTH_ONLY_LABEL = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" });

/** How many months the grid shows at once — see WINDOW_SIZE's own use below for why the window
 * (not a single month) is what "1mo"/"3mo" actually shift. */
const WINDOW_SIZE = 3;

/**
 * /spotting/:lineId/details — a line's own analytics page: key fleet numbers, a vehicle × date
 * spotting-intensity grid showing a rolling WINDOW_SIZE-month window (3 months ending "now" by
 * default), navigable by 1 or 3 months, and a first look at station-level assets (lifts/
 * escalators) ahead of a future volunteer-reporting feature — see StationAssetsSectionComponent's
 * own doc comment for exactly what that is and isn't yet.
 */
@Component({
    selector: "app-line-details",
    imports: [
        RouterLink,
        HlmButton,
        HlmSkeleton,
        RetryBannerComponent,
        LineStatusBadge,
        FleetSummaryComponent,
        VehicleSpottingGridComponent,
        StationAssetsSectionComponent,
        VehicleStatusTrendComponent,
    ],
    template: `
        <div class="flex flex-col gap-6">
            <!-- top-[61px], matching line-overview's own sticky row: app-nav is 61px tall and
                 sticky too, so this stacks directly beneath it rather than fighting it for the
                 same slot. -mx-4/px-4 (sm:-mx-6/px-6): bleeds to the full page-content width so
                 the sticky background doesn't show the page's own side padding as gaps. -->
            <div #titleBar class="bg-background sticky top-[61px] z-20 -mx-4 flex flex-col gap-3 px-4 py-2 sm:-mx-6 sm:px-6">
                @if (_line(); as line) {
                    <a
                        [routerLink]="['/spotting', lineId()]"
                        class="text-muted-foreground hover:text-foreground w-fit text-sm hover:underline"
                    >
                        ← Back to {{ line.code }}
                    </a>
                    <div class="flex flex-wrap items-center gap-3">
                        <h1 class="text-2xl font-bold">{{ line.displayName }} — Details</h1>
                        <line-status-badge [status]="line.status" />
                        <!-- Mirrors line-overview's own merge-on-scroll: once the full Key Line
                             Data chips (below) have scrolled up behind this bar, a compact copy
                             joins the title instead of losing the summary entirely. -->
                        @if (_scrolled() && !vehicleTypesResource.isLoading()) {
                            <app-fleet-summary
                                [vehicleTypes]="_vehicleTypes()"
                                [compact]="true"
                                [activeStatus]="statusFilter()"
                                (statusSelected)="statusFilter.set($event)"
                            />
                        }
                    </div>
                }
            </div>

            @if (vehicleTypesResource.isLoading()) {
                <div hlmSkeleton class="h-24 w-full"></div>
            } @else if (vehicleTypesResource.hasError()) {
                <app-retry-banner [resource]="vehicleTypesResource" message="Couldn't load this line's fleet." />
            } @else {
                <section class="flex flex-col gap-3">
                    <h2 class="text-lg font-semibold">Key Line Data</h2>
                    <app-fleet-summary
                        #fleetSummaryAnchor
                        class="line-details-fleet-summary-anchor"
                        [vehicleTypes]="_vehicleTypes()"
                        [activeStatus]="statusFilter()"
                        (statusSelected)="statusFilter.set($event)"
                    />
                    <app-vehicle-status-trend [lineId]="lineId()" />
                </section>

                <section class="flex flex-col gap-3">
                    <div
                        #activityControls
                        class="bg-background sticky z-[15] -mx-4 flex flex-wrap items-center justify-between gap-3 px-4 py-2 sm:-mx-6 sm:px-6"
                        [style.top.px]="NAV_HEIGHT + titleBarHeight()"
                    >
                        <h2 class="text-lg font-semibold">Spotting Activity</h2>
                        <div class="flex items-center gap-1.5">
                            <button hlmBtn variant="outline" size="sm" [disabled]="!canGoBack(3)" (click)="shiftMonths(-3)">
                                «« 3mo
                            </button>
                            <button hlmBtn variant="outline" size="sm" [disabled]="!canGoBack(1)" (click)="shiftMonths(-1)">
                                « 1mo
                            </button>
                            <span class="min-w-40 text-center text-sm font-medium">{{ windowLabel() }}</span>
                            <button hlmBtn variant="outline" size="sm" [disabled]="!canGoForward(1)" (click)="shiftMonths(1)">
                                1mo »
                            </button>
                            <button hlmBtn variant="outline" size="sm" [disabled]="!canGoForward(3)" (click)="shiftMonths(3)">
                                3mo »»
                            </button>
                        </div>
                    </div>
                    <app-vehicle-spotting-grid
                        [lineId]="lineId()"
                        [vehicleTypes]="_vehicleTypes()"
                        [months]="windowMonths()"
                        [statusFilter]="statusFilter()"
                        [stickyOffset]="NAV_HEIGHT + titleBarHeight() + activityControlsHeight()"
                    />
                </section>

                <app-station-assets-section [lineId]="lineId()" [stickyOffset]="NAV_HEIGHT + titleBarHeight()" />
            }
        </div>
    `,
})
export class LineDetailsPage {
    readonly lineId = input.required<string>();

    /** app-nav's own measured height — same constant line-overview.page.ts hardcodes as
     * `top-[61px]`. Every sticky layer on this page stacks below it. */
    protected readonly NAV_HEIGHT = 61;

    protected readonly linesStore = inject(SpottingLinesStore);
    protected readonly _line = computed(() => this.linesStore.lineById(this.lineId()));
    protected readonly statusFilter = signal<VehicleStatus | null>(null);

    protected readonly vehicleTypesResource = graphqlResource<VehicleTypesQueryData, VehicleTypesQueryVars>(() => ({
        query: VEHICLE_TYPES_QUERY,
        variables: { lineId: this.lineId() },
    }));
    protected readonly _vehicleTypes = computed(() => this.vehicleTypesResource.data()?.vehicleTypes ?? []);

    /** The title bar's own real height (not including NAV_HEIGHT) — the activity controls bar
     * stacked below it offsets by NAV_HEIGHT + this, measured rather than guessed for the same
     * reason as line-overview's own sticky bar (see its own doc comment): this row grows once
     * the compact fleet-summary chips join it on scroll. */
    private readonly titleBar = viewChild("titleBar", { read: ElementRef });
    protected readonly titleBarHeight = signal(0);

    /** The "Spotting Activity" heading + month-nav controls bar's own height — the grid's own
     * sticky header stacks directly beneath this one, at NAV_HEIGHT + titleBarHeight + this. */
    private readonly activityControls = viewChild("activityControls", { read: ElementRef });
    protected readonly activityControlsHeight = signal(0);

    /** True once the full Key Line Data chips (below the title bar) have scrolled up behind it —
     * same IntersectionObserver-against-a-measured-rootMargin approach as line-overview.page.ts's
     * own `_scrolled`, see its doc comment for the full reasoning. */
    private readonly fleetSummaryAnchor = viewChild("fleetSummaryAnchor", { read: ElementRef });
    protected readonly _scrolled = signal(false);
    private summaryObserver: IntersectionObserver | undefined;

    private readonly _today = firstOfMonth(new Date());
    /** The most recent month in the visible window — the other WINDOW_SIZE-1 months are derived
     * from this one, so shifting the window is just moving this single value. Defaults to the
     * current month, giving a 3-month window ending "now" (the requested default) rather than
     * one bare month. */
    protected readonly windowEndMonth = signal(this._today);
    protected readonly windowMonths = computed(() =>
        Array.from({ length: WINDOW_SIZE }, (_, i) => addMonths(this.windowEndMonth(), i - (WINDOW_SIZE - 1)))
    );

    private readonly boundsResource = graphqlResource<LineSpottingBoundsQueryData, LineSpottingBoundsQueryVars>(() => ({
        query: LINE_SPOTTING_BOUNDS_QUERY,
        variables: { lineId: this.lineId(), start: BOUNDS_FLOOR, end: dateOf(this._today) },
    }));

    /** The earliest month with any real data — `null` while that's still loading/unknown, in
     * which case the "back" buttons stay enabled rather than guessing wrong in either direction. */
    private readonly _earliestMonthKey = computed<string | null>(() => {
        const rows = this.boundsResource.data()?.lines[0]?.vehicleSpottingTrends ?? [];
        if (rows.length === 0) {
            return null;
        }
        return rows.map((r) => r.dateKey.slice(0, 7)).sort()[0];
    });

    /** e.g. "Jun – Aug 2026" when the window sits in one year, "Nov 2025 – Jan 2026" when it
     * spans two — only naming the year once when it'd otherwise just repeat itself. */
    protected readonly windowLabel = computed(() => {
        const months = this.windowMonths();
        const start = months[0];
        const end = months[months.length - 1];
        const startLabel = start.getUTCFullYear() === end.getUTCFullYear() ? MONTH_ONLY_LABEL.format(start) : MONTH_LABEL.format(start);
        return `${startLabel} – ${MONTH_LABEL.format(end)}`;
    });

    constructor() {
        const destroyRef = inject(DestroyRef);

        observeHeight(this.titleBar, (h) => this.titleBarHeight.set(h));
        observeHeight(this.activityControls, (h) => this.activityControlsHeight.set(h));

        effect(() => {
            const anchorRef = this.fleetSummaryAnchor();
            const stickyTop = this.NAV_HEIGHT + this.titleBarHeight();
            this.summaryObserver?.disconnect();
            this.summaryObserver = undefined;
            if (!anchorRef || typeof IntersectionObserver === "undefined") {
                return;
            }
            // Same hydration-staleness fallback as line-overview.page.ts's own version of this
            // effect — see its doc comment for why a disconnected ElementRef needs this.
            const anchor = anchorRef.nativeElement.isConnected
                ? anchorRef.nativeElement
                : document.querySelector<HTMLElement>(".line-details-fleet-summary-anchor");
            if (!anchor) {
                return;
            }
            const observer = new IntersectionObserver(
                ([entry]) => {
                    const rect = entry.boundingClientRect;
                    if (rect.width === 0 && rect.height === 0) {
                        return;
                    }
                    this._scrolled.set(!entry.isIntersecting);
                },
                { rootMargin: `-${stickyTop}px 0px 0px 0px` }
            );
            observer.observe(anchor);
            this.summaryObserver = observer;
        });
        destroyRef.onDestroy(() => this.summaryObserver?.disconnect());
    }

    protected canGoBack(steps: number): boolean {
        const earliest = this._earliestMonthKey();
        if (!earliest) {
            return true;
        }
        const newStart = addMonths(this.windowEndMonth(), -steps - (WINDOW_SIZE - 1));
        return monthKey(newStart) >= earliest;
    }

    protected canGoForward(steps: number): boolean {
        return monthKey(addMonths(this.windowEndMonth(), steps)) <= monthKey(this._today);
    }

    protected shiftMonths(delta: number): void {
        this.windowEndMonth.update((m) => addMonths(m, delta));
    }
}

function dateOf(date: Date): string {
    return date.toISOString().slice(0, 10);
}
