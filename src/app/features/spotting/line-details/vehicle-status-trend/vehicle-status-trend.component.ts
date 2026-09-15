import { httpResource } from "@angular/common/http";
import { DecimalPipe } from "@angular/common";
import { Component, computed, signal, input } from "@angular/core";
import { environment } from "../../../../../environments/environment";
import { HlmButton } from "../../../../ui/button/button";
import { HlmSkeleton } from "../../../../ui/skeleton/skeleton";
import { VehicleStatus } from "../../../../core/graphql/types";

interface StatusTrendRow {
  status: VehicleStatus;
  count: number;
  date: string;
}

interface DaySegment {
  status: VehicleStatus;
  count: number;
  percent: number;
}

interface DayColumn {
  dateKey: string;
  total: number;
  segments: DaySegment[];
}

interface XTick {
  dateKey: string;
  label: string;
  offsetPx: number;
}

/** Same status→color mapping FleetSummaryComponent uses for its chips, kept as its own small copy
 * here rather than exported/shared — this is the only other place that needs it, and the two are
 * free to drift independently if either one's palette needs change later. */
const STATUS_COLOR: Record<VehicleStatus, string> = {
  IN_SERVICE: "bg-emerald-500",
  NOT_SPOTTED: "bg-amber-500",
  OUT_OF_SERVICE: "bg-red-500",
  DECOMMISSIONED: "bg-neutral-500",
  MARRIED: "bg-purple-500",
  TESTING: "bg-blue-500",
  UNKNOWN: "bg-slate-500",
};
const STATUS_LABEL: Record<VehicleStatus, string> = {
  IN_SERVICE: "In Service",
  NOT_SPOTTED: "Not Spotted",
  OUT_OF_SERVICE: "Out of Service",
  DECOMMISSIONED: "Decommissioned",
  MARRIED: "Married",
  TESTING: "Testing",
  UNKNOWN: "Unknown",
};

/** How far back this chart looks — the old app's equivalent (`ui-vehicle-status-history`, see
 * docs/frontend-map/situasi.md) hardcoded a trailing 10 months; this uses a shorter 6-month
 * window instead, since day-by-day resolution over 10 months makes for a very long horizontal
 * scroll for a section that's collapsed by default and meant as a quick trend glance. */
const WINDOW_DAYS = 180;

/** One bar per day, `BAR_GAP_PX` apart via the chart row's own `gap-px` (Tailwind's 1px gap) —
 * kept as plain numbers (not Tailwind width classes) so `xTicks` can compute each tick's pixel
 * offset in JS against the exact same values the template renders bars at. */
const BAR_W_PX = 6;
const BAR_GAP_PX = 1;
const BAR_STEP_PX = BAR_W_PX + BAR_GAP_PX;

type DataSourceId = "MLPTF" | "MTREC" | "prasarana";

interface DataSourceOption {
  id: DataSourceId;
  label: string;
  disabled: boolean;
  /** Shown beneath the selector for the *active* source, and as a disabled option's own
   * `title` tooltip — ported verbatim from the old app's `ui-vehicle-status-history`
   * `nz-segmented` `infoTip`s (see `services/get-data.service.ts` there for the matching
   * endpoint `source` segment). `null` for MLPTF: the old app showed no disclaimer for it
   * either — it's this project's own primary spotting data, not a secondary scrape. */
  disclaimer: string | null;
}

const DATA_SOURCES: DataSourceOption[] = [
  { id: "MLPTF", label: "MLPTF", disabled: false, disclaimer: null },
  {
    id: "MTREC",
    label: "MTREC",
    disabled: false,
    disclaimer:
      "Data is scraped on a best effort basis from Malaysia Trains & Rail Enthusiasts (MTREC) and hence may not reflect entirely their data.",
  },
  {
    id: "prasarana",
    label: "Prasarana",
    disabled: true,
    disclaimer: "Official data from Prasarana website collected on a best effort basis.",
  },
];

const MONTH_TICK_LABEL = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
const TOOLTIP_DATE_LABEL = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * "Fleet status over time" — collapsed-by-default trend chart in /spotting/:lineId/details' Key
 * Line Data section, ported from the old app's `ui-vehicle-status-history` (an `@antv/g2plot`
 * stacked area chart of raw per-status vehicle counts per day). Re-built here as a plain
 * hand-rolled stacked-bar strip instead of pulling in a charting dependency — matching this app's
 * own established pattern for the *other* custom chart already in this codebase
 * (spotting-activity-heatmap.ts is hand-rolled SVG/CSS too, not backed by any chart library) —
 * and, since the request was specifically for a *percentage* view, each day's bar is normalized
 * to its own day's total rather than plotting raw counts (whose absolute height told you fleet
 * size more than status mix).
 *
 * Data comes straight from the legacy REST endpoint (`operation/line_vehicles_status_trend_count`)
 * rather than GraphQL — confirmed there's no GraphQL equivalent for this particular history table
 * yet. The endpoint takes a `source` path segment (see `DATA_SOURCES`), same as the old app's own
 * `get-data.service.ts` — `MLPTF` is this project's own spotting data, `MTREC` a best-effort
 * scrape of a separate enthusiast group's records, and `prasarana` was never actually wired up on
 * the old app either (its segmented option was permanently `disabled`) — kept here, still
 * disabled, so switching this component doesn't quietly drop a source the old app at least
 * *named* as a future possibility.
 */
@Component({
  selector: "app-vehicle-status-trend",
  imports: [HlmSkeleton, HlmButton, DecimalPipe],
  template: `
    <details class="rounded-lg border">
      <summary
        class="text-muted-foreground hover:text-foreground cursor-pointer px-3 py-2 text-sm font-medium select-none"
      >
        Fleet status over time
      </summary>
      <div class="border-t p-3">
        <div class="mb-3 flex flex-wrap items-center gap-2">
          <span class="text-muted-foreground text-xs font-medium">Source:</span>
          <div class="flex gap-1">
            @for (source of dataSources; track source.id) {
              <button
                type="button"
                hlmBtn
                size="xs"
                [variant]="selectedSource() === source.id ? 'default' : 'outline'"
                [disabled]="source.disabled"
                [title]="source.disabled ? source.disclaimer : ''"
                (click)="selectedSource.set(source.id)"
              >
                {{ source.label }}
              </button>
            }
          </div>
        </div>
        @if (activeDisclaimer()) {
          <p class="text-muted-foreground mb-3 text-xs italic">{{ activeDisclaimer() }}</p>
        }

        @if (resource.isLoading()) {
          <div hlmSkeleton class="h-24 w-full"></div>
        } @else if (resource.error()) {
          <p class="text-muted-foreground text-sm">
            Couldn't load fleet status history for this line.
          </p>
        } @else if (columns().length === 0) {
          <p class="text-muted-foreground text-sm">
            No fleet status history recorded yet for this source.
          </p>
        } @else {
          <!-- Readout panel instead of a floating tooltip callout: this chart lives inside
                         its own overflow-x-auto scroll strip, and an absolutely-positioned tooltip
                         anchored to a hovered bar would be at the mercy of that same "overflow-x:
                         auto silently promotes overflow-y to auto too" quirk documented on the
                         vehicle-spotting-grid right above this section — any tooltip tall enough to
                         clear the bar it's anchored to would risk getting clipped by its own
                         scrolling ancestor. A fixed-height line above the chart that just reflects
                         whichever bar is currently hovered sidesteps that entirely. -->
          <div
            class="bg-muted/50 mb-2 flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2.5 py-1.5 text-xs"
          >
            @if (hoveredCol(); as col) {
              <span class="font-medium">{{ tooltipDateLabel(col.dateKey) }}</span>
              @for (seg of col.segments; track seg.status) {
                <span class="flex items-center gap-1">
                  <span class="size-2 rounded-full" [class]="statusColor(seg.status)"></span>
                  {{ statusLabel(seg.status) }} — {{ seg.count }} ({{
                    seg.percent | number: "1.0-0"
                  }}%)
                </span>
              }
            } @else {
              <span class="text-muted-foreground">Hover a bar for that day's breakdown.</span>
            }
          </div>

          <div class="flex gap-2">
            <!-- Y axis: fixed 0/25/50/75/100% ticks — every bar is normalized to its
                             own day's total (see the class doc comment), so the scale never
                             changes and doesn't need to be computed from the data. -->
            <div
              class="text-muted-foreground flex h-32 w-9 flex-col justify-between pb-px text-right text-[10px] tabular-nums"
            >
              <span>100%</span>
              <span>75%</span>
              <span>50%</span>
              <span>25%</span>
              <span>0%</span>
            </div>
            <div class="min-w-0 flex-1 overflow-x-auto">
              <div
                #chartRow
                class="relative flex h-32 items-end gap-px"
                (mouseleave)="hoveredCol.set(null)"
              >
                <!-- Gridlines at the same 25% steps as the y-axis labels — purely
                                     decorative, not read by anything. -->
                <div
                  class="pointer-events-none absolute inset-0 flex flex-col justify-between"
                  aria-hidden="true"
                >
                  @for (_ of gridlineRows; track $index) {
                    <div class="border-border/60 border-t"></div>
                  }
                </div>
                @for (col of columns(); track col.dateKey) {
                  <div
                    class="relative flex h-full flex-col-reverse rounded-[1px] outline-offset-1"
                    [style.width.px]="BAR_W_PX"
                    [class.ring-2]="hoveredCol()?.dateKey === col.dateKey"
                    [class.ring-foreground]="hoveredCol()?.dateKey === col.dateKey"
                    [attr.aria-label]="col.dateKey + ' — ' + col.total + ' vehicles'"
                    (mouseenter)="hoveredCol.set(col)"
                  >
                    @for (seg of col.segments; track seg.status) {
                      <div [style.height.%]="seg.percent" [class]="statusColor(seg.status)"></div>
                    }
                  </div>
                }
              </div>
              <!-- X axis: one tick per visible month, positioned via the same
                                 BAR_STEP_PX the bars above are laid out at. -->
              <div class="relative mt-1 h-4">
                @for (tick of xTicks(); track tick.dateKey) {
                  <span
                    class="text-muted-foreground absolute text-[10px]"
                    [style.left.px]="tick.offsetPx"
                  >
                    {{ tick.label }}
                  </span>
                }
              </div>
            </div>
          </div>

          <div class="mt-2 flex flex-wrap gap-3 text-xs">
            @for (status of legendStatuses(); track status) {
              <span class="flex items-center gap-1.5">
                <span class="size-2.5 rounded-full" [class]="statusColor(status)"></span>
                {{ statusLabel(status) }}
              </span>
            }
          </div>
        }
      </div>
    </details>
  `,
})
export class VehicleStatusTrendComponent {
  readonly lineId = input.required<string>();

  protected readonly BAR_W_PX = BAR_W_PX;
  protected readonly dataSources = DATA_SOURCES;
  protected readonly gridlineRows = [0, 1, 2]; // 3 internal lines → 4 even 25% bands

  protected readonly selectedSource = signal<DataSourceId>("MLPTF");
  protected readonly activeDisclaimer = computed(
    () => this.dataSources.find((s) => s.id === this.selectedSource())?.disclaimer ?? null,
  );

  protected readonly hoveredCol = signal<DayColumn | null>(null);

  private readonly _range = computed(() => {
    const end = new Date();
    const start = new Date(end.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
    return { start: isoDate(start), end: isoDate(end) };
  });

  protected readonly resource = httpResource<StatusTrendRow[]>(() => {
    const { start, end } = this._range();
    return `${environment.backendUrl}operation/line_vehicles_status_trend_count/${this.lineId()}/${this.selectedSource()}/${start}/${end}/`;
  });

  protected readonly columns = computed<DayColumn[]>(() => {
    const rows = this.resource.value() ?? [];
    const byDate = new Map<string, Partial<Record<VehicleStatus, number>>>();
    for (const row of rows) {
      const perStatus = byDate.get(row.date) ?? {};
      perStatus[row.status] = (perStatus[row.status] ?? 0) + row.count;
      byDate.set(row.date, perStatus);
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateKey, perStatus]) => {
        const total = Object.values(perStatus).reduce((sum, c) => sum + (c ?? 0), 0);
        const segments: DaySegment[] = (Object.entries(perStatus) as [VehicleStatus, number][])
          .filter(([, count]) => count > 0)
          .map(([status, count]) => ({
            status,
            count,
            percent: total === 0 ? 0 : (count / total) * 100,
          }));
        return { dateKey, total, segments };
      });
  });

  /** One tick per calendar month actually present in `columns()`, positioned at that month's
   * first bar's left edge — `BAR_STEP_PX` (bar width + the row's own `gap-px`) is the same
   * per-bar pixel step the template lays bars out at, so index × step lines a tick up with its
   * bar without needing to measure the DOM. */
  protected readonly xTicks = computed<XTick[]>(() => {
    const cols = this.columns();
    const ticks: XTick[] = [];
    let lastMonth = "";
    cols.forEach((col, i) => {
      const month = col.dateKey.slice(0, 7);
      if (month !== lastMonth) {
        ticks.push({
          dateKey: col.dateKey,
          label: MONTH_TICK_LABEL.format(new Date(`${col.dateKey}T00:00:00Z`)),
          offsetPx: i * BAR_STEP_PX,
        });
        lastMonth = month;
      }
    });
    return ticks;
  });

  protected readonly legendStatuses = computed<VehicleStatus[]>(() => {
    const seen = new Set<VehicleStatus>();
    for (const col of this.columns()) {
      for (const seg of col.segments) {
        seen.add(seg.status);
      }
    }
    return [...seen];
  });

  protected statusColor(status: VehicleStatus): string {
    return STATUS_COLOR[status];
  }

  protected statusLabel(status: VehicleStatus): string {
    return STATUS_LABEL[status];
  }

  protected tooltipDateLabel(dateKey: string): string {
    return TOOLTIP_DATE_LABEL.format(new Date(`${dateKey}T00:00:00Z`));
  }
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
