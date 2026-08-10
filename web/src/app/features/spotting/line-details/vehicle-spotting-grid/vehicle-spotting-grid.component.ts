import {
    Component,
    DestroyRef,
    ElementRef,
    Injector,
    afterNextRender,
    computed,
    effect,
    inject,
    input,
    signal,
    viewChild,
    viewChildren,
} from "@angular/core";
import { graphqlResource } from "../../../../core/graphql/graphql-client";
import { VehicleStatus } from "../../../../core/graphql/types";
import { dateKeyOf, spottingIntensityClass } from "../../../../domain-ui/spotting-activity-heatmap/spotting-activity-heatmap";
import { SpottingCountTooltipComponent } from "../../../../domain-ui/spotting-activity-heatmap/spotting-count-tooltip.component";
import { VehicleStatusBadge } from "../../../../domain-ui/vehicle-status-badge/vehicle-status-badge";
import { RetryBannerComponent } from "../../../../ui/retry-banner/retry-banner.component";
import { HlmSkeleton } from "../../../../ui/skeleton/skeleton";
import { LINE_SPOTTING_GRID_QUERY, LineSpottingGridQueryData, LineSpottingGridQueryVars, VehicleType } from "../../data/spotting.queries";

interface GridRow {
    vehicleId: string;
    identificationNo: string;
    status: VehicleStatus;
}

interface GridSection {
    typeId: string;
    typeName: string;
    rows: GridRow[];
}

/** One day in the visible window's column headers. */
interface GridColumn {
    dateKey: string;
    dayOfMonth: number;
    isWeekend: boolean;
    /** True for the 1st of each visible month — draws the persistent divider (a plain `border-l`
     * baked into the cell itself, see `dayHeaderClass`/`dayCellClass`) that survives horizontal
     * scroll because it travels with the cell rather than needing to be redrawn as an overlay. */
    isMonthStart: boolean;
    isToday: boolean;
}

/** One visible month's worth of columns, under its own header label. */
interface MonthGroup {
    key: string;
    label: string;
    /** This group's first column's position in the flattened `columns()` list — lets
     * `monthLabelShift` compute the group's pixel span without re-deriving it via a linear scan
     * of `columns()` on every call. */
    startIndex: number;
    columns: GridColumn[];
}

const MONTH_GROUP_LABEL = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const TODAY_KEY = dateKeyOf(new Date());

/** Every row (header, section label, data) is this tall on *both* sides of the names/grid split
 * — see the class doc comment for why those are two independent `<table>`s that need to agree
 * pixel-for-pixel to still look like one grid. Header rows are two of these stacked (month label
 * + day number). Kept tall enough to comfortably fit a status badge without the row's real
 * content height ever exceeding this — see `ROW_H`'s own note on the vehicle-row cell padding. */
const ROW_H = 32;

/** Every day column is this wide, on both the mirrored header and the scrolling body — enforced
 * via an explicit `<colgroup>` on each of those two (independent) tables rather than left to each
 * table's own auto-sizing, which is what keeps the two pixel-aligned as the body scrolls under
 * the header's mirrored transform (see the class doc comment). */
const COL_W = 28;

/** Total header height on *both* sides — month-label row + day-number row, nothing more. This has
 * to be a fixed constant, not "however tall the day-grid header happens to be at the moment": the
 * two header tables are otherwise-independent elements, and if one grew/shrank purely from
 * scrolling while the other stayed fixed, everything below them — cell rows on one side, vehicle
 * names on the other — drifts out of alignment by exactly that difference the moment they
 * disagree. The currently-pinned section's mirrored aggregate row (see `_currentSection` and the
 * template's own `dayGridMirror` div) is *not* counted here even though it visually sits right
 * below this header — it's a zero-height sticky wrapper whose actual content overflows downward
 * only while a section is pinned, so it never adds to either side's reserved flow height the way
 * an earlier revision's literal third `<tr>` did. */
const DAY_GRID_HEADER_H = ROW_H * 2;

/** Fallback reserve for `monthLabelShift`, used only for the handful of frames before
 * `monthLabelWidths` has measured each label's *real* rendered width (see that signal) — a plain
 * guess turned out too small for the actual "Mon YYYY" text at this font size, letting the label
 * visibly slide into the next month's columns before it hit its own edge. */
const MONTH_LABEL_FALLBACK_RESERVE_PX = COL_W * 3;

/**
 * The vehicle × date spotting-intensity grid for /spotting/:lineId/details — one row per vehicle
 * (grouped by vehicle type, then sorted by identification number within each type, matching
 * VehicleListComponent's own default sort), one column per day across the currently-viewed
 * months, cell shade from `spottingIntensityClass` (the same banding the profile/vehicle-detail
 * activity heatmaps use, so "busy" reads consistently everywhere in the app).
 *
 * Three independent pieces, not one table: the vehicle-name column (plus the type-group labels)
 * never scrolls; the day-cell grid's *header* (month + day-number rows) is sticky against the
 * *page* and mirrors the body's horizontal scroll via a synced CSS transform rather than actually
 * scrolling itself; the day-cell *body* is the only piece that owns real `overflow-x-auto` scroll.
 * This three-way split is forced by a real CSS constraint, not a stylistic choice: any `overflow`
 * other than `visible` on an ancestor (even one that never actually overflows) becomes the
 * containing block for `position: sticky` descendants, on *both* axes — the "coerce visible to
 * auto when the other axis isn't visible" rule in the CSS Overflow spec means `overflow-x: auto`
 * alone silently promotes `overflow-y` to `auto` too. A single element that's both "the thing that
 * scrolls horizontally" and "the thing that's sticky vertically against the page" is therefore a
 * dead end in pure CSS — its own horizontal-scroll ancestor *is* its sticky containing block, and
 * that ancestor's own box never scrolls vertically (it just flows with the page, unbounded height),
 * so nothing ever triggers the sticky offset. Splitting the header out into its own non-scrolling,
 * ordinarily-sticky element and mirroring the body's `scrollLeft` onto it via `transform` is the
 * standard way around that (same trick most virtualized-table libraries use).
 *
 * Neither side scrolls or sticks *vertically* within itself — this section flows in the normal
 * page, not a nested scroll region — so the names table, the header, and the body only ever need
 * to agree on one thing each: every row is exactly `ROW_H` tall, and every day column exactly
 * `COL_W` wide, on every side that renders it.
 *
 * The vehicle-type label (`#sectionAnchor` below) is `position: sticky` on the names-table side —
 * confirmed this can't be symmetric-by-omission: without something covering the *same* row on the
 * day-grid side, that row's real scrolling content (whichever vehicle's cells happen to occupy
 * that pixel band at the moment) painted straight through behind the "stuck" label, a visibly
 * broken half-pinned/half-scrolling row. `dayGridMirror` covers exactly that gap — but it can't
 * live *inside* `#bodyScroll`: per this same doc comment's own note above, that div is a scroll
 * container (the overflow-x/y promotion quirk), and `position: sticky` inside a scroll container
 * sticks against *that container*, not the page — since `#bodyScroll` never actually scrolls
 * vertically, a sticky element inside it would just sit inert at its natural position, never
 * engaging at all. `dayGridMirror` is instead a sibling of `#bodyScroll` (a real page-sticky
 * context, like the header above it) with `height: 0` — contributing nothing to either side's
 * flow height regardless of scroll state — whose actual visible content overflows downward only
 * while `_currentSection()` is non-null, mirroring the label's own pinned/not-pinned state.
 */
@Component({
    selector: "app-vehicle-spotting-grid",
    imports: [HlmSkeleton, RetryBannerComponent, VehicleStatusBadge, SpottingCountTooltipComponent],
    template: `
        <div class="flex flex-col gap-3">
            @if (isAwaitingCurrentView()) {
                <div hlmSkeleton class="h-64 w-full"></div>
            } @else if (resource.hasError()) {
                <app-retry-banner [resource]="resource" message="Couldn't load this period's spotting data." />
            } @else {
                <!-- #gridContainer: read back in the scroll handler so every sticky piece below
                     can tell once this whole grid's own last row has scrolled above the sticky
                     boundary — see pastGrid's own doc comment for why nothing here would
                     otherwise ever stop sticking on its own. -->
                <div #gridContainer class="flex items-start rounded-lg border">
                    <!-- Names + type labels — fixed, never scrolls, plain page-sticky header.
                         items-start (not the flex default of stretch): the sibling on the right
                         is taller by its own horizontal scrollbar's thickness (an auto-overflow
                         box with unconstrained height renders as content height plus the
                         scrollbar strip) — stretch would then force this table to match that
                         inflated height, and a table given more height than the sum of its own
                         rows doesn't evenly leave that slack at the bottom, it visibly throws off
                         row-to-row alignment against the other side. Neither side needs to match
                         the other's height at the container level; they only need every row to
                         agree on ROW_H, which holds regardless of how tall either container ends
                         up being overall. -->
                    <table class="border-collapse text-xs">
                        <thead>
                            <!-- DAY_GRID_HEADER_H, not a plain single-row height — see that
                                 constant's own doc comment for why this header must always
                                 reserve the same total height as the day-grid's header on the
                                 other side. -->
                            <tr [style.height.px]="DAY_GRID_HEADER_H" class="bg-card z-10" [class.sticky]="!pastGrid()" [style.top.px]="stickyOffset()">
                                <th class="border-b-2 p-2 text-left font-medium whitespace-nowrap">Vehicle</th>
                            </tr>
                        </thead>
                        <!-- #namesTbody + .vehicle-spotting-grid-names-tbody: read back in the
                             scroll handler purely for its own bottom edge (see
                             mirrorPushProgress's doc comment) — a plain DOM measurement, not
                             gated behind any class/style binding that depends on signals this
                             same scroll tick is about to update, so it can never be read one
                             render behind like #sectionAnchor's own sticky class can. The class
                             name backs a live-DOM fallback for the same hydration-staleness
                             reason as line-details.page.ts's own fleetSummaryAnchor — see the
                             constructor for why the ElementRef alone isn't enough here either. -->
                        <tbody #namesTbody class="vehicle-spotting-grid-names-tbody">
                            @for (section of sections(); track section.typeId) {
                                <tr [style.height.px]="ROW_H">
                                    <!-- #sectionAnchor + data-type-id: read back in the scroll
                                         handler (see constructor) to know which section's label is
                                         *currently* the one pinned at this sticky boundary, so the
                                         day-grid's own mirrored aggregation row (dayGridMirror,
                                         below) can show the matching section instead of a stale/
                                         wrong one — see the class doc comment for why that mirror
                                         has to exist at all. Clicking still collapses/expands this
                                         type's own vehicle rows (on both sides — see isCollapsed
                                         below); this row itself (and its day-grid counterpart,
                                         which carries the actual per-date totals — see the
                                         #bodyScroll tbody below) stays visible either way, since a
                                         per-type total is exactly what you want once the individual
                                         vehicles are hidden. This is deliberately the *same* row as
                                         the per-date totals on the day-grid side, not a separate
                                         "Total" row beneath the vehicles — the totals belong right
                                         beside the vehicle type name, not called out as their own
                                         row. -->
                                    <td
                                        #sectionAnchor
                                        [attr.data-type-id]="section.typeId"
                                        [class]="sectionLabelClass(section.typeId)"
                                        [style.top.px]="stickyOffset() + DAY_GRID_HEADER_H"
                                        [style.transform]="'translateY(-' + sectionPushShift(section.typeId) + 'px)'"
                                        (click)="toggleCollapsed(section.typeId)"
                                    >
                                        <span class="flex items-center gap-1.5">
                                            <svg
                                                viewBox="0 0 24 24"
                                                class="size-3 shrink-0 transition-transform duration-150"
                                                [class.-rotate-90]="isCollapsed(section.typeId)"
                                                fill="none"
                                                stroke="currentColor"
                                                stroke-width="2"
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                aria-hidden="true"
                                            >
                                                <path d="m6 9 6 6 6-6" />
                                            </svg>
                                            {{ section.typeName }}
                                        </span>
                                    </td>
                                </tr>
                                @if (!isCollapsed(section.typeId)) {
                                    @for (row of section.rows; track row.vehicleId) {
                                        <tr [style.height.px]="ROW_H">
                                            <td class="bg-card border-b px-2 py-1 whitespace-nowrap">
                                                <div class="flex items-center justify-between gap-2">
                                                    <span>{{ row.identificationNo }}</span>
                                                    <vehicle-status-badge [status]="row.status" />
                                                </div>
                                            </td>
                                        </tr>
                                    }
                                }
                            }
                        </tbody>
                    </table>

                    <!-- Day cells: header mirrors the body's scrollLeft via transform and sticks
                         against the page on its own; the body is the only element that actually
                         scrolls horizontally. See the class doc comment for why this can't be one
                         table both sticky and scrollable at once. -->
                    <div class="min-w-0 flex-1 border-l">
                        <div class="z-20 overflow-hidden bg-card" [class.sticky]="!pastGrid()" [style.top.px]="stickyOffset()">
                            <table
                                class="border-collapse text-xs"
                                style="table-layout: fixed"
                                [style.width.px]="gridWidth()"
                                [style.transform]="'translateX(-' + headerScrollLeft() + 'px)'"
                            >
                                <colgroup>
                                    @for (col of columns(); track col.dateKey) {
                                        <col [style.width.px]="COL_W" />
                                    }
                                </colgroup>
                                <thead>
                                    <tr [style.height.px]="ROW_H">
                                        @for (group of monthGroups(); track group.key) {
                                            <th
                                                class="overflow-hidden border-b border-l p-1 text-left text-xs font-medium whitespace-nowrap"
                                                [attr.colspan]="group.columns.length"
                                            >
                                                <!-- The <th> itself keeps its full colspan-wide box exactly where the
                                                     day columns beneath it lay out — only this inner span slides, so
                                                     the label can visually track the viewport while scrolling through
                                                     its own month without the <th>'s background/border overrunning
                                                     into the next month's cell. text-left (not the usual text-center
                                                     every other header cell uses): monthLabelShift computes this
                                                     span's translateX as an absolute offset from the <th>'s own left
                                                     edge — text-center would add its own (width-dependent, and this
                                                     late in layout, hard to predict) offset on top of that, double-
                                                     counting the centering monthLabelShift already does by hand via
                                                     centerPx. #monthLabel is measured (see monthLabelWidths, keyed by
                                                     group.key rather than array index) so the clamps in
                                                     monthLabelShift are based on this label's *actual* rendered width,
                                                     not a guessed constant. The <th>'s own overflow-hidden clips the
                                                     label at month boundaries. -->
                                                <span
                                                    #monthLabel
                                                    [attr.data-month-key]="group.key"
                                                    class="inline-block px-1"
                                                    [style.transform]="'translateX(' + monthLabelShift(group) + 'px)'"
                                                >
                                                    {{ group.label }}
                                                </span>
                                            </th>
                                        }
                                    </tr>
                                    <tr [style.height.px]="ROW_H">
                                        @for (col of columns(); track col.dateKey) {
                                            <th [class]="dayHeaderClass(col)">{{ col.dayOfMonth }}</th>
                                        }
                                    </tr>
                                </thead>
                            </table>
                        </div>
                        <!-- Zero-height sticky wrapper — see the class doc comment for why this
                             has to be a sibling of #bodyScroll rather than living inside it, and
                             why "height: 0" rather than a real reserved row. The wrapper itself
                             always renders (so it's always eligible to stick at the right offset);
                             the visible cover band inside it always renders too now — collapsed to
                             0 height, rather than removed via @if, whenever there's no current
                             section — so switching from "nothing pinned yet" to "first section
                             pinned" never has to create this table's DOM from scratch. That
                             create-on-first-use was a real, confirmed source of a one-frame flash
                             right as the very first vehicle type reached the sticky boundary —
                             every *later* handoff between two already-pinned sections only ever
                             changed this same table's cell text, never its structure, so only the
                             first one ever paid that cost. translateY(-mirrorPushProgress()): kept
                             in lockstep with the names-table label's own real rendered position
                             (see that signal's own doc comment) — not just its section-handoff
                             push (pushProgress) — so the two sides slide away together during a
                             handoff *and* stay aligned through the last section's own native-sticky
                             clamp, which pushProgress alone never captures. -->
                        <div class="sticky z-10" [style.top.px]="stickyOffset() + DAY_GRID_HEADER_H" style="height: 0px">
                            <div
                                class="overflow-hidden bg-muted"
                                [style.height.px]="_currentSection() && !pastGrid() ? ROW_H : 0"
                                [style.transform]="'translateY(-' + mirrorPushProgress() + 'px)'"
                            >
                                <table
                                    class="border-collapse text-xs"
                                    style="table-layout: fixed"
                                    [style.width.px]="gridWidth()"
                                    [style.transform]="'translateX(-' + headerScrollLeft() + 'px)'"
                                >
                                    <colgroup>
                                        @for (col of columns(); track col.dateKey) {
                                            <col [style.width.px]="COL_W" />
                                        }
                                    </colgroup>
                                    <tbody>
                                        <tr [style.height.px]="ROW_H" class="text-muted-foreground">
                                            @for (col of columns(); track col.dateKey) {
                                                <td class="border-t p-0 text-center text-[10px] tabular-nums" [class.border-l]="col.isMonthStart">
                                                    @if (_currentSection(); as section) {
                                                        {{ aggregateFor(section, col.dateKey) || "—" }}
                                                    }
                                                </td>
                                            }
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <!-- relative z-[5]: gives this whole scrolling body one real stacking
                             context (an *explicit* z-index, not just isolation — see
                             dayCellClass's own note on why isolating each <td> individually was
                             the wrong level for this). z-[5] sits below the sticky header's z-20
                             (so an open tooltip loses to the header once they visually overlap)
                             but, being a genuine explicit z-index rather than plain auto-stacking
                             content, unambiguously outranks the *names table* next to it — a
                             tooltip overflowing left into that column no longer gets painted over
                             by its plain, non-stacking-context <td>s regardless of DOM order. -->
                        <div #bodyScroll class="relative z-[5] overflow-x-auto" (scroll)="onBodyScroll($event)">
                            <table class="border-collapse text-xs" style="table-layout: fixed" [style.width.px]="gridWidth()">
                                <colgroup>
                                    @for (col of columns(); track col.dateKey) {
                                        <col [style.width.px]="COL_W" />
                                    }
                                </colgroup>
                                <tbody>
                                    @for (section of sections(); track section.typeId) {
                                        <!-- Per-date totals, not a blank spacer — this is the exact row that lines up
                                             with the names-table's own section-label row (#sectionAnchor above), which
                                             has no day-cell counterpart of its own otherwise. Carrying the totals *here*
                                             (rather than as a trailing row after the individual vehicles, the previous
                                             design) is what puts them beside the vehicle type name rather than below
                                             it — the two are the same row, just the label half and the totals half of
                                             it. relative z-[5]: on its own this row is a plain sibling of the vehicle-
                                             data rows below it in the same stacking context (#bodyScroll's own z-[5])
                                             — an explicit match rather than "whatever painting happens to fall out of
                                             DOM order" so this row's own bg-muted background can never end up
                                             compositing above a later-painted date cell (e.g. the today wash) during a
                                             scroll-driven repaint; it still loses to the sticky mirror copy above
                                             (dayGridMirror, z-10) once a section is actually pinned, exactly as
                                             intended — the live version takes over, this one just continues normal
                                             flow underneath it. -->
                                        <tr [style.height.px]="ROW_H" class="bg-muted text-muted-foreground relative z-[5]">
                                            @for (col of columns(); track col.dateKey) {
                                                <td class="border-b p-0 text-center text-[10px] tabular-nums" [class.border-l]="col.isMonthStart">
                                                    {{ aggregateFor(section, col.dateKey) || "—" }}
                                                </td>
                                            }
                                        </tr>
                                        @if (!isCollapsed(section.typeId)) {
                                            @for (row of section.rows; track row.vehicleId) {
                                                <tr [style.height.px]="ROW_H">
                                                    @for (col of columns(); track col.dateKey) {
                                                        <td
                                                            [class]="dayCellClass(col)"
                                                            (mouseenter)="onCellHoverStart(row.vehicleId, row.identificationNo, col.dateKey, $event)"
                                                            (mouseleave)="hoveredCell.set(null)"
                                                        >
                                                            @if (col.isToday) {
                                                                <!-- The breathing wash, separated from the pill below rather
                                                                     than an animate-pulse class on the <td> itself — the <td>
                                                                     also contains the spotting-intensity pill, and pulsing
                                                                     the whole cell's opacity would fade that pill in and out
                                                                     along with the background, which reads as "this vehicle's
                                                                     spotting data is flickering", not "this is today". z-0 +
                                                                     the pill's own z-10 (below) keep this wash strictly behind
                                                                     it despite both being absolutely/normally positioned
                                                                     siblings. -->
                                                                <div
                                                                    class="bg-amber-400/15 dark:bg-amber-400/20 pointer-events-none absolute inset-0 z-0 animate-pulse"
                                                                    aria-hidden="true"
                                                                ></div>
                                                            }
                                                            <div class="relative z-10 mx-auto size-4 rounded-sm" [class]="cellClass(row.vehicleId, col.dateKey)"></div>
                                                        </td>
                                                    }
                                                </tr>
                                            }
                                        }
                                    }
                                </tbody>
                            </table>
                            <!-- Rendered once, as a plain sibling of the <table> — not nested
                                 inside whichever <td> is currently hovered, the way it used to be.
                                 Table cells turn out not to reliably honor normal z-index/paint-
                                 order rules for absolutely-positioned descendants in every
                                 browser (confirmed directly: even a very high explicit z-index on
                                 this whole scrolling container didn't stop a *plain, unstyled*
                                 sibling cell from painting over an open tooltip once hovering far
                                 enough down the grid) — a table-external element sidesteps that
                                 quirk entirely by never being a table-cell's descendant in the
                                 first place. Positioned via hoveredCellPos (measured at hover
                                 time in onCellHoverStart) rather than living inside the real cell,
                                 sized to match one cell (COL_W × ROW_H) so the tooltip's own
                                 internal centering renders identically either way. -->
                            @if (hoveredCell(); as cell) {
                                @if (hoveredCellPos(); as pos) {
                                    <div class="pointer-events-none absolute" [style.top.px]="pos.top" [style.left.px]="pos.left" [style.width.px]="COL_W" [style.height.px]="ROW_H">
                                        <app-spotting-count-tooltip
                                            [label]="cell.label"
                                            [dateKey]="cell.dateKey"
                                            [count]="countFor(cell.vehicleId, cell.dateKey)"
                                            [above]="tooltipAbove()"
                                        />
                                    </div>
                                }
                            }
                        </div>
                    </div>
                </div>
            }
        </div>
    `,
})
export class VehicleSpottingGridComponent {
    readonly lineId = input.required<string>();
    readonly vehicleTypes = input.required<VehicleType[]>();
    /** First day of each month to display, oldest first — any other day of a given month works
     * too, only the year/month of each entry is read. */
    readonly months = input.required<Date[]>();
    readonly statusFilter = input<VehicleStatus | null>(null);
    /** Where this grid's own sticky header should stick — the parent (line-details.page.ts)
     * measures its own stacked sticky bars' real height and passes the total down, same pattern
     * as VehicleListComponent's `stickyOffset`. */
    readonly stickyOffset = input(0);

    protected readonly ROW_H = ROW_H;
    protected readonly COL_W = COL_W;
    protected readonly DAY_GRID_HEADER_H = DAY_GRID_HEADER_H;

    /** Which cell's popup is showing, if any. Gated on a signal rather than pure CSS hover for
     * the same reason as spotting-activity-heatmap's own `hoveredDate`: at most one tooltip
     * element exists at a time, not one per cell sitting invisible in the DOM — and, since this
     * one is rendered once outside the table entirely (see `hoveredCellPos` and the template's
     * own comment on why), it needs the hovered vehicle/date carried alongside it rather than
     * recovered from whichever `<td>` it happened to be nested in. */
    protected readonly hoveredCell = signal<{ vehicleId: string; label: string; dateKey: string } | null>(null);
    /** The hovered cell's position, in `#bodyScroll`-relative pixels — measured once at hover
     * time (see `onCellHoverStart`), not tracked reactively against scroll: the cell the tooltip
     * is anchored to is dismissed on scroll anyway (see the constructor's scroll listener), so
     * there's never a frame where this position needs to be live-updated while visible. */
    protected readonly hoveredCellPos = signal<{ top: number; left: number } | null>(null);
    protected readonly tooltipAbove = signal(true);

    /** Vehicle types collapsed by clicking their own label — hides their individual vehicle rows
     * on both sides of the split (see `isCollapsed` usages in the template) while leaving their
     * aggregation row visible, since that's exactly the summary you want once the detail is
     * hidden. Not persisted across navigation — a fresh grid always starts fully expanded. */
    protected readonly collapsedTypes = signal<ReadonlySet<string>>(new Set());

    /** The body's own `scrollLeft`, mirrored onto the header via `transform: translateX(-n)` — see
     * the class doc comment for why the header can't just scroll along with the body itself. */
    protected readonly headerScrollLeft = signal(0);

    private readonly bodyScroll = viewChild<ElementRef<HTMLElement>>("bodyScroll");
    /** One per rendered month group, in document order — measured (see the constructor) so
     * `monthLabelShift` can clamp against each label's *real* rendered width instead of a guess. */
    private readonly monthLabelEls = viewChildren("monthLabel", { read: ElementRef });
    /** Keyed by `MonthGroup.key`, not array position — measured from the rendered `#monthLabel`
     * elements. */
    protected readonly monthLabelWidths = signal<Record<string, number>>({});
    /** `#bodyScroll`'s own visible width — see `monthLabelShift`'s doc comment for why the
     * visibility gate needs this alongside `headerScrollLeft`. */
    protected readonly bodyScrollWidth = signal(0);
    /** One per rendered section, in document order — read in the scroll handler to figure out
     * which section's label is currently pinned at the sticky boundary. See `#sectionAnchor` in
     * the template and the constructor's scroll listener. */
    private readonly sectionAnchors = viewChildren("sectionAnchor", { read: ElementRef });
    /** The names-table's single shared `<tbody>` (every section's rows, not one per section) —
     * read only for its own bottom edge, to derive `mirrorPushProgress`'s last-section clamp. See
     * that signal's own doc comment for why this has to be a plain, binding-independent
     * measurement rather than the current anchor's own rect. */
    private readonly namesTbody = viewChild<ElementRef<HTMLElement>>("namesTbody");
    /** The section whose *names-table* label is currently sitting at the sticky boundary — drives
     * which section's aggregation row gets mirrored into `dayGridMirror`. `null` before any
     * section has actually reached that boundary (matching the label's own look at that point:
     * still at its natural, unstuck position, so there's nothing to mirror yet). */
    protected readonly currentSectionId = signal<string | null>(null);
    protected readonly _currentSection = computed(() => this.sections().find((s) => s.typeId === this.currentSectionId()) ?? null);
    /** How many px the *currently* pinned section's label (and its mirrored aggregation row) is
     * translated upward — 0 while there's no section right behind it about to take over, ramping
     * up to `ROW_H` (fully off-screen) exactly as the *next* section's own row reaches the sticky
     * boundary. Only the current section is ever `position: sticky` (see `sectionLabelClass`) — a
     * plain unconditional sticky on every row, the original design, made the handoff between two
     * sections an instant pop (the new row's sticky engagement landing on the exact same pixel the
     * old one was still glued to, with the later-in-DOM one simply painting over the earlier one)
     * rather than the "old one gets physically pushed out of the way" look being asked for here.
     * Driven off the *next* section's real (never-sticky, so never artificially held in place)
     * `getBoundingClientRect().top` — see the constructor's scroll handler for the derivation. */
    protected readonly pushProgress = signal(0);
    /** What the mirror's own translateY should be — equal to `pushProgress` during a section-to-
     * section handoff (see that signal's own doc comment), but diverges from it for the *last*
     * section: once the names-table's single shared `<tbody>` (every section's rows, not one per
     * section) runs out of rows beneath the sticky boundary, native CSS `position: sticky` clamps
     * `td.sticky` upward on its own — zero JS transform involved, so `pushProgress` (which only
     * ever reacts to a *next* section's anchor, and there is none for the last one) stays at 0
     * throughout. The mirror sits in a structurally separate container (see the class doc
     * comment's "three independent pieces") whose own sticky containing block ends a few pixels
     * later, so it never gets clamped at the same scroll position — left alone, it stays glued to
     * `top: boundary` while the label drifts upward beside it. Derived from `#namesTbody`'s own
     * bottom edge (see the constructor) rather than the current anchor's rect: the anchor's
     * *sticky engagement* itself depends on `currentSectionId`, which this same scroll tick may
     * have just changed — reading its rect before Angular re-renders that class binding caught a
     * stale, not-yet-sticky position (confirmed live: a full section-height jump right as a new
     * section first reaches the boundary). `#namesTbody`'s bottom is a plain DOM measurement with
     * no such binding in between, so it can never lag a tick behind. */
    protected readonly mirrorPushProgress = signal(0);
    /** True once the grid's own last row has scrolled above the sticky boundary entirely — nothing
     * in this component has any business staying pinned to the top of the page once its own content
     * has nothing left to anchor against; without this, every sticky piece here (this component
     * relies entirely on page-level sticky, with no bounding "overflow" ancestor of its own to clip
     * against) would otherwise stay glued in place forever, floating over whatever page content
     * comes after this grid (Station Assets, on /spotting/:lineId/details). */
    protected readonly pastGrid = signal(false);
    private readonly gridContainer = viewChild<ElementRef<HTMLElement>>("gridContainer");

    /** Set once the grid has auto-scrolled today's column into view, so a later month-navigation
     * re-render (which recomputes `columns()` too) never fights a user's own manual scroll
     * position — this is strictly an on-first-load behavior. */
    private hasScrolledToToday = false;

    protected readonly sections = computed<GridSection[]>(() => {
        const filter = this.statusFilter();
        return [...this.vehicleTypes()]
            .sort((a, b) => a.displayName.localeCompare(b.displayName))
            .map((type) => ({
                typeId: type.id,
                typeName: type.displayName,
                rows: [...type.vehicles]
                    .filter((v) => !filter || v.status === filter)
                    .sort((a, b) => a.identificationNo.localeCompare(b.identificationNo, undefined, { numeric: true }))
                    .map((v) => ({ vehicleId: v.id, identificationNo: v.identificationNo, status: v.status })),
            }))
            .filter((section) => section.rows.length > 0);
    });

    protected readonly monthGroups = computed<MonthGroup[]>(() => {
        let startIndex = 0;
        return this.months().map((month) => {
            const year = month.getUTCFullYear();
            const monthIndex = month.getUTCMonth();
            const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
            const columns = Array.from({ length: daysInMonth }, (_, i) => {
                const date = new Date(Date.UTC(year, monthIndex, i + 1));
                const weekday = date.getUTCDay();
                const dateKey = dateKeyOf(date);
                return {
                    dateKey,
                    dayOfMonth: i + 1,
                    isWeekend: weekday === 0 || weekday === 6,
                    isMonthStart: i === 0,
                    isToday: dateKey === TODAY_KEY,
                };
            });
            const group = { key: `${year}-${monthIndex}`, label: MONTH_GROUP_LABEL.format(month), startIndex, columns };
            startIndex += columns.length;
            return group;
        });
    });

    protected readonly columns = computed<GridColumn[]>(() => this.monthGroups().flatMap((g) => g.columns));
    protected readonly gridWidth = computed(() => this.columns().length * COL_W);

    private readonly _range = computed(() => {
        const cols = this.columns();
        return { start: cols[0].dateKey, end: cols[cols.length - 1].dateKey };
    });

    protected readonly resource = graphqlResource<LineSpottingGridQueryData, LineSpottingGridQueryVars>(() => ({
        query: LINE_SPOTTING_GRID_QUERY,
        variables: { lineId: this.lineId(), start: this._range().start, end: this._range().end },
    }));

    /** Whether the skeleton should show instead of the grid — deliberately *not* `resource.isLoading()`:
     * `graphqlResource`'s `isLoading` only ever reports `true` for this resource's very first fetch
     * (by design, so background *retries* after an error don't re-flash the skeleton — see that
     * function's own doc comment). It stays `false` forever after the first success, including
     * while a genuinely new fetch is in flight for different variables (e.g. month navigation
     * shifting `_range()`, or switching `lineId`). Gating on that left the grid mounted with the
     * *previous* range's already-loaded data during such a refetch — confirmed live: every month-nav
     * click flashed the previous window's spotting counts, keyed by `vehicleId|dateKey`, under the
     * *new* date columns before the new response landed. `resource.data()` itself doesn't have this
     * problem — it's cleared back to `undefined` synchronously the moment the request's variables
     * actually change (Angular's resource only carries the previous value over when the recomputed
     * request is reference-equal to the last one, true for a same-variables retry, false for a real
     * variable change) — so checking for its absence is what actually tracks "is there a fetch in
     * flight for what's currently asked for", not just "has this resource ever loaded before". */
    protected readonly isAwaitingCurrentView = computed(() => !this.resource.data() && !this.resource.hasError());

    /** `${vehicleId}|${dateKey}` → count, and the grid's own current max (for intensity scaling
     * relative to what's actually visible in this window, not some app-wide constant). */
    private readonly _countsByKey = computed(() => {
        const rows = this.resource.data()?.lines[0]?.vehicleSpottingTrends ?? [];
        const map = new Map<string, number>();
        for (const row of rows) {
            map.set(`${row.vehicle.id}|${row.dateKey}`, row.count);
        }
        return map;
    });

    private readonly _maxCount = computed(() => Math.max(1, ...this._countsByKey().values()));

    constructor() {
        const destroyRef = inject(DestroyRef);
        // Captured here (still in an injection context), so the effect() created inside
        // afterNextRender's callback below — which runs *outside* one — can be told explicitly
        // which injector to use instead of throwing NG0203.
        const injector = inject(Injector);

        // Brings "today" into view on first load rather than leaving the grid scrolled to the
        // start of the (oldest-first) date range — the ref only exists once loading finishes, so
        // this effect naturally waits for that; `hasScrolledToToday` then stops it from ever
        // running again on a later month-navigation re-render.
        const scrollToTodayRef = effect(() => {
            const el = this.bodyScroll()?.nativeElement;
            if (!el || this.hasScrolledToToday) {
                return;
            }
            const idx = this.columns().findIndex((c) => c.isToday);
            if (idx === -1) {
                return;
            }
            this.hasScrolledToToday = true;
            const target = Math.max(0, idx * COL_W - el.clientWidth / 2 + COL_W / 2);
            el.scrollLeft = target;
            this.headerScrollLeft.set(el.scrollLeft);

            // Re-verify shortly after: confirmed live that #bodyScroll's *native* scrollLeft can
            // silently reset back to 0 a moment after this runs (observed via a MutationObserver:
            // the element is briefly detached and reattached, with no accompanying change to any
            // signal this effect — or any other in this component — tracks, so nothing would ever
            // naturally re-trigger a fix). No app-level state changes when this happens: `resource`
            // stays loaded, `sections()`/`columns()` are untouched, and the reset is invisible until
            // a section's aggregation row later gets pinned and switches from this (silently
            // desynced) native-scroll view to the `dayGridMirror` header-driven one, which reads
            // `headerScrollLeft` instead — the two disagreeing is what actually reads as "the data
            // changes and shifts" once that happens. Re-querying `bodyScroll()` fresh (rather than
            // reusing `el`) covers both the "same node, scroll silently reset" case and the "node
            // actually got replaced" case in one check. A couple of checks spaced out is a
            // pragmatic guard against a timing quirk we don't have full visibility into — not a
            // generic retry loop — so this deliberately doesn't re-verify indefinitely.
            for (const delayMs of [1000, 3000]) {
                const timer = setTimeout(() => {
                    const currentEl = this.bodyScroll()?.nativeElement;
                    if (currentEl && currentEl.scrollLeft !== target) {
                        currentEl.scrollLeft = target;
                        this.headerScrollLeft.set(currentEl.scrollLeft);
                    }
                }, delayMs);
                destroyRef.onDestroy(() => clearTimeout(timer));
            }
        });
        destroyRef.onDestroy(() => scrollToTodayRef.destroy());

        afterNextRender(() => {
            // Re-measures whenever the set of rendered month-label elements changes (navigating
            // the visible month window swaps in differently-worded labels, e.g. "Jun 2026" →
            // "Sep 2026", each with its own real width) — not on every scroll tick, since a
            // label's rendered width never changes just because the page scrolled. Created here,
            // not in the constructor directly: `getBoundingClientRect()` doesn't exist on
            // Angular's server-side DOM shim, and this whole callback only ever runs client-side.
            const monthLabelWidthsRef = effect(
                () => {
                    const widths: Record<string, number> = {};
                    for (const el of this.monthLabelEls()) {
                        const key = el.nativeElement.dataset["monthKey"];
                        if (key) {
                            widths[key] = el.nativeElement.getBoundingClientRect().width;
                        }
                    }
                    this.monthLabelWidths.set(widths);
                },
                { injector }
            );
            destroyRef.onDestroy(() => monthLabelWidthsRef.destroy());

            // Tracks this grid's own visible viewport width — see monthLabelShift's own doc
            // comment for why the "don't show a label until enough of its month is visible" rule
            // needs this, not just headerScrollLeft. ResizeObserver over a plain window resize
            // listener: this element's own width can change independent of the window (e.g. the
            // page's content column narrowing/widening at a breakpoint) too. A reactive `effect()`
            // (not a one-time `if (el)` check run only at this single afterNextRender callback) —
            // #bodyScroll doesn't exist yet the first time this runs, since that first run lands
            // right after the *loading skeleton*'s render, before the day-grid (and #bodyScroll)
            // ever mounts; a one-time check left bodyScrollWidth stuck at 0 forever, which pushed
            // every month label fully off-screen (see monthLabelShift's own clamp math). The same
            // reactivity also re-attaches on every later loading→loaded remount (e.g. a month-nav
            // refetch tears down and recreates #bodyScroll), where a one-time check would otherwise
            // keep observing a now-detached element instead of the fresh one.
            let bodyScrollResizeObserver: ResizeObserver | undefined;
            const bodyScrollWidthRef = effect(
                () => {
                    bodyScrollResizeObserver?.disconnect();
                    const el = this.bodyScroll()?.nativeElement;
                    if (!el || typeof ResizeObserver === "undefined") {
                        return;
                    }
                    this.bodyScrollWidth.set(el.clientWidth);
                    bodyScrollResizeObserver = new ResizeObserver(() => this.bodyScrollWidth.set(el.clientWidth));
                    bodyScrollResizeObserver.observe(el);
                },
                { injector }
            );
            destroyRef.onDestroy(() => {
                bodyScrollResizeObserver?.disconnect();
                bodyScrollWidthRef.destroy();
            });

            // Two independent reasons to react to the *page's* own scroll (not bodyScroll's — this
            // grid never scrolls vertically itself, see the class doc comment):
            //  1. Figure out which section's names-table label is currently pinned at the sticky
            //     boundary, by directly measuring where each one actually is right now — cheap
            //     (there are only ever as many sections as vehicle types on this line) and, unlike
            //     IntersectionObserver's threshold-crossing callbacks, gives an unambiguous answer
            //     on every tick rather than needing to reconstruct "current" from partial events.
            //  2. Dismiss any open cell tooltip — the tooltip is a normal (non-portal) element
            //     anchored to its cell (see the template), so scrolling *should* move it along with
            //     that cell, but leaving it open while the page scrolls means it drifts past the
            //     sticky header the whole way, which is exactly the "tooltip scrolling all over the
            //     page" behavior this closes off instead.
            const onPageScroll = () => {
                this.hoveredCell.set(null);

                const containerEl = this.gridContainer()?.nativeElement;
                const past = containerEl ? containerEl.getBoundingClientRect().bottom <= this.stickyOffset() : false;
                this.pastGrid.set(past);
                if (past) {
                    this.currentSectionId.set(null);
                    this.pushProgress.set(0);
                    this.mirrorPushProgress.set(0);
                    return;
                }

                const boundary = this.stickyOffset() + DAY_GRID_HEADER_H;
                const anchors = this.sectionAnchors();
                let currentIdx = -1;
                for (let i = 0; i < anchors.length; i++) {
                    if (anchors[i].nativeElement.getBoundingClientRect().top <= boundary + 0.5) {
                        currentIdx = i;
                    } else {
                        // Sections render in document order with monotonically increasing
                        // positions — once one hasn't reached the boundary yet, none after it
                        // have either.
                        break;
                    }
                }
                this.currentSectionId.set(currentIdx >= 0 ? (anchors[currentIdx].nativeElement.dataset["typeId"] ?? null) : null);

                // The section right behind the current one is never itself `position: sticky`
                // (see sectionLabelClass) — its own getBoundingClientRect().top is therefore its
                // real, always-accurate flow position, decreasing smoothly as the page scrolls
                // regardless of whatever the current section's row is doing. Once it's a full
                // ROW_H below the boundary there's nothing to push yet (progress 0); by the time
                // it reaches the boundary itself (progress ROW_H, current fully pushed away) it's
                // exactly the point `currentIdx` above flips to it on the *next* scroll tick —
                // continuous, so there's no visible seam at the handoff.
                const next = currentIdx >= 0 ? anchors[currentIdx + 1] : undefined;
                let handoffPush = 0;
                if (next) {
                    const nextTop = next.nativeElement.getBoundingClientRect().top;
                    handoffPush = Math.min(ROW_H, Math.max(0, boundary + ROW_H - nextTop));
                }
                this.pushProgress.set(handoffPush);

                // Last-section clamp (see mirrorPushProgress's own doc comment): once
                // #namesTbody's bottom edge is less than ROW_H below the boundary, native sticky
                // is clamping td.sticky upward by exactly that shortfall regardless of any JS
                // transform. Only ever relevant for the last section (every earlier one hits
                // `handoffPush` first, well before its own tbody could run out of room), so taking
                // the max keeps this a no-op everywhere else. Same hydration-staleness fallback as
                // line-details.page.ts's own `fleetSummaryAnchor` — a disconnected ElementRef here
                // (confirmed live, straight after hydration) reads back a zeroed rect, which reads
                // as "boundary is way past the tbody's own bottom" and produces a huge bogus clamp.
                const namesTbodyRef = this.namesTbody()?.nativeElement;
                const namesTbodyEl = namesTbodyRef?.isConnected
                    ? namesTbodyRef
                    : document.querySelector<HTMLElement>(".vehicle-spotting-grid-names-tbody");
                const tbodyBottom = namesTbodyEl?.getBoundingClientRect().bottom ?? Infinity;
                const lastSectionClamp = Math.max(0, boundary + ROW_H - tbodyBottom);
                this.mirrorPushProgress.set(Math.max(handoffPush, lastSectionClamp));
            };

            onPageScroll();
            window.addEventListener("scroll", onPageScroll, { passive: true });
            destroyRef.onDestroy(() => window.removeEventListener("scroll", onPageScroll));

            // Sections/columns can change (month navigation, status filter, line switch) with no
            // scroll event of their own — re-run whenever the anchors themselves change so
            // `currentSectionId` doesn't linger pointing at a section that no longer renders (or
            // no longer renders where it used to).
            const rescanRef = effect(
                () => {
                    this.sectionAnchors();
                    onPageScroll();
                },
                { injector }
            );
            destroyRef.onDestroy(() => rescanRef.destroy());
        });
    }

    protected countFor(vehicleId: string, dateKey: string): number {
        return this._countsByKey().get(`${vehicleId}|${dateKey}`) ?? 0;
    }

    protected cellClass(vehicleId: string, dateKey: string): string {
        return spottingIntensityClass(this.countFor(vehicleId, dateKey), this._maxCount());
    }

    /** Sum of every visible (post-filter) vehicle's count in `section`, for one date column — the
     * per-vehicle-type total shown in both the inline and sticky-mirrored aggregation rows. */
    protected aggregateFor(section: GridSection, dateKey: string): number {
        return section.rows.reduce((sum, row) => sum + this.countFor(row.vehicleId, dateKey), 0);
    }

    /** Whether `group`'s label should render at all right now — only once the *currently visible
     * slice* of this month (within `#bodyScroll`'s viewport, which is generally narrower than a
     * whole month) is wide enough to fit the label without clipping either of its own edges.
     * Deliberately not "is any part of this month visible" — showing the label the instant a
     * single pixel of a new month appears, then having `monthLabelShift`'s own clamps immediately
     * cut it off at the viewport or month edge, is exactly the half-a-label-hanging-off-the-edge
     * look this is trying to avoid; see that method's own doc comment for the full geometry this
     * mirrors. Uses the fallback reserve (not the real measured width) for a month that's never
     * rendered a label yet — a brief first-frame guess is fine since the real width self-corrects
     * the moment it *does* render (see the constructor's measurement effect). */
    /** How far right (in px, added on top of the header table's own overall `translateX`, and on
     * top of the `<span>`'s own natural position flush against the *left* edge of its `<th>` — see
     * the template's own comment on why that `<th>` is `text-left`, not centered) a month group's
     * label should slide. This is the same shape as native `position: sticky` with both `left` and
     * `right` set, computed by hand because the header table isn't actually scrolling — it's
     * translated by hand to mirror `#bodyScroll` (see the class doc comment) — so a *real* sticky
     * child of it would just sit inert, never engaging, for the exact reason `dayGridMirror` can't
     * live inside `#bodyScroll` either:
     *
     *  - The label's own "resting" position, with nothing scrolled near either of its edges yet,
     *    is centered in the month (`centerPx`, not the month's start) — "assumes its position at
     *    the center of the month" once released from either sticky edge.
     *  - While that resting position would render past the *right* edge of whatever's currently
     *    visible (`viewRight`, or the month's own end, whichever is nearer) — i.e. the month has
     *    only just started entering from the right — the label instead clamps flush against that
     *    edge, "following in from the right" as more of the month scrolls into view, rather than
     *    staying invisible/off-screen until the resting position itself becomes reachable.
     *  - While that resting position would render past the *left* edge of what's visible (the
     *    month is on its way out, scrolled mostly past) — it clamps flush against that edge
     *    instead, "stays there" — until the clamp's own upper bound (the month's end, minus the
     *    label's width) drops below it too, meaning even hugging the month's own trailing edge
     *    has run out of room; from that point the label is genuinely leaving with the rest of the
     *    month's columns, "until the last of the month exits too".
     *
     * Both clamps are bounded by the month's own start/end (never the *next* month's real
     * columns, and never the previous one's) as well as by the viewport — whichever is tighter —
     * so the label slides naturally with scroll, clipped by the <th>'s overflow-hidden. */
    protected monthLabelShift(group: MonthGroup): number {
        const monthStartPx = group.startIndex * COL_W;
        const monthWidthPx = group.columns.length * COL_W;
        const monthEndPx = monthStartPx + monthWidthPx;
        const labelWidth = this.monthLabelWidths()[group.key] ?? MONTH_LABEL_FALLBACK_RESERVE_PX;
        // +4px breathing room past the label's own measured width — flush against the exact edge
        // reads as "about to overflow" even when it technically isn't yet.
        const labelSpace = labelWidth + 4;
        const centerPx = monthStartPx + monthWidthPx / 2;
        const viewLeft = this.headerScrollLeft();
        const viewRight = viewLeft + this.bodyScrollWidth();

        const restingLeft = centerPx - labelWidth / 2;
        const stickyLeftEdge = Math.max(monthStartPx, viewLeft);
        const stickyRightEdge = Math.min(monthEndPx, viewRight) - labelSpace;
        const targetLeft = Math.min(Math.max(restingLeft, stickyLeftEdge), stickyRightEdge);
        return targetLeft - monthStartPx;
    }

    protected dayHeaderClass(col: GridColumn): string {
        return [
            "border-b p-1 text-center font-normal whitespace-nowrap",
            col.isMonthStart ? "border-l" : "",
            col.isWeekend ? "bg-muted" : "",
            // Static — not animate-pulse. The body cells below breathe down the whole column (see
            // the template's wash div); this header cell deliberately doesn't, so the one thing
            // that's always on screen while scrolling isn't also the thing drawing the most
            // attention to itself every couple of seconds.
            col.isToday ? "relative z-10 bg-amber-400/15 ring-2 ring-amber-500/70 dark:bg-amber-400/20" : "",
        ]
            .filter(Boolean)
            .join(" ");
    }

    protected dayCellClass(col: GridColumn): string {
        return [
            // align-middle (not flex + items-center): a plain <td> keeps the browser's native
            // table cell layout, which lays cells out side by side per row; giving one `display:
            // flex` instead makes the browser stop treating it as a table cell at all — confirmed
            // directly, every row silently stacked its ~90 cells top-to-bottom instead of left-to-
            // right, each row ballooning to (cell count × cell height) tall. `align-middle` is the
            // table-native way to vertically center a cell's content; the pill centers horizontally
            // via its own `mx-auto` (see the template) instead of needing flex here at all.
            // relative (not relative+isolate): needed as the containing block for the today wash
            // and the hover tooltip (both absolutely positioned — see the template), but isolating
            // *here* was the wrong level for containing the tooltip's z-index — it also trapped
            // the tooltip against *sibling cells* in the row below whenever it rendered downward
            // instead of upward (confirmed live: it disappeared behind the very next row once
            // hovering far enough down the grid that room-below beat room-above). That's now
            // handled once, correctly, by #bodyScroll's own explicit z-index in the template.
            "relative border-b p-0 align-middle",
            col.isMonthStart ? "border-l" : "",
        ]
            .filter(Boolean)
            .join(" ");
    }

    protected onBodyScroll(event: Event): void {
        this.headerScrollLeft.set((event.target as HTMLElement).scrollLeft);
    }

    /** Only the *current* section's label is ever actually `position: sticky` — every other
     * section's row sits in plain normal flow (scrolled past already, or not reached yet). See
     * `pushProgress`'s own doc comment for why: with every row unconditionally sticky (the
     * original design), two sections glued at the exact same boundary pixel is an instant,
     * unanimated swap — the later-in-DOM one just paints over the earlier one the moment it
     * arrives. Restricting stickiness to one row at a time, combined with the translateY driven
     * by `pushProgress`, is what turns that into an actual "old one slides up and out" handoff. */
    protected sectionLabelClass(typeId: string): string {
        const isCurrent = typeId === this.currentSectionId() && !this.pastGrid();
        return [
            "bg-muted text-muted-foreground z-[6] cursor-pointer border-t border-b px-2 py-1 font-semibold whitespace-nowrap select-none",
            isCurrent ? "sticky" : "",
        ]
            .filter(Boolean)
            .join(" ");
    }

    /** translateY for the currently-pinned section's label — see `pushProgress`'s own doc comment.
     * A no-op (0) for every section that isn't the current one; those aren't sticky at all (see
     * `sectionLabelClass`), so a transform on them would have nothing to visibly act on anyway. */
    protected sectionPushShift(typeId: string): number {
        return typeId === this.currentSectionId() ? this.pushProgress() : 0;
    }

    protected isCollapsed(typeId: string): boolean {
        return this.collapsedTypes().has(typeId);
    }

    protected toggleCollapsed(typeId: string): void {
        this.collapsedTypes.update((current) => {
            const next = new Set(current);
            if (next.has(typeId)) {
                next.delete(typeId);
            } else {
                next.add(typeId);
            }
            return next;
        });
    }

    /** Pops the tooltip toward whichever side of the *viewport* currently has more room — there's
     * no bounded scroll container to measure against any more (see the class doc comment), so
     * this compares against the window itself rather than a local wrapper's rect. Also measures
     * the cell's position relative to `#bodyScroll` (see `hoveredCellPos`) — the tooltip renders
     * outside the table entirely now, so it needs that position handed to it rather than being
     * able to rely on living inside the hovered cell itself. */
    protected onCellHoverStart(vehicleId: string, label: string, dateKey: string, event: Event): void {
        this.hoveredCell.set({ vehicleId, label, dateKey });
        const cellRect = (event.currentTarget as HTMLElement).getBoundingClientRect();
        const bodyEl = this.bodyScroll()?.nativeElement;
        if (bodyEl) {
            const bodyRect = bodyEl.getBoundingClientRect();
            this.hoveredCellPos.set({
                top: cellRect.top - bodyRect.top + bodyEl.scrollTop,
                left: cellRect.left - bodyRect.left + bodyEl.scrollLeft,
            });
        }
        const roomAbove = cellRect.top;
        const roomBelow = window.innerHeight - cellRect.bottom;
        this.tooltipAbove.set(roomAbove > roomBelow);
    }
}
