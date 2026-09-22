import { Component, computed, effect, input, signal } from "@angular/core";
import { graphqlResource } from "../../../core/graphql/graphql-client";
import { HlmSkeleton } from "../../../ui/skeleton/skeleton";
import { RetryBannerComponent } from "../../../ui/retry-banner/retry-banner.component";
import {
  LINE_STATUS_HISTORY_QUERY,
  LineStatusHistoryQueryData,
  LineStatusHistoryQueryVars,
  LineStatusHourBucket,
  PassengerStatus,
} from "../data/home.queries";
import { PASSENGER_LABEL } from "../data/passenger-status.util";
import { PASSENGER_SCALE } from "../data/status-info.util";

/** The community service day runs 03:00 → 02:00, so that's the hour the backend buckets from. */
export const SERVICE_DAY_START_HOUR = 3;

/** Bar/segment fill per passenger status — the same palette vocabulary the fleet trend chart uses. */
const BAR_CLASS: Record<PassengerStatus, string> = {
  NORMAL: "bg-emerald-500",
  BUSY: "bg-blue-500",
  CROWDED: "bg-amber-500",
  EXTREMELY_CROWDED: "bg-red-500",
  BACKLOGGED: "bg-orange-500",
  DELAYED: "bg-yellow-500",
  DISRUPTED: "bg-rose-600",
};

/** Bucket hours are Malaysia service hours — formatted in MYT so every viewer reads the same day. */
const HOUR_LABEL = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Kuala_Lumpur",
});

/** The shortest visible stub for an hour that has reports, so a count of 1 is still a bar. */
const MIN_BAR_PERCENT = 6;

/**
 * Reserved block height every chart state shares (loading skeleton, empty message, loaded chart),
 * so swapping between them never moves the card below it. `min-h-40` = 160px, a little past the
 * chart's natural height (readout + 24-hour bars + the label axis).
 */
export const CHART_STATE_MIN_HEIGHT_CLASS = "min-h-40";

/** Every hour of the service day is labelled, so the axis can't rely on the container's width. */
const HOUR_AXIS_MIN_WIDTH_CLASS = "min-w-[24rem]";

/** One slice of an hour's bar: a single status's share of that hour, stacked in severity order. */
interface ChartSegment {
  /** `null` only on the defensive fallback when the bucket carries no per-status counts. */
  status: PassengerStatus | null;
  count: number;
  heightPct: number;
  colorClass: string;
}

interface ChartBar {
  hourStart: string;
  hourLabel: string;
  tickLabel: string;
  rangeLabel: string;
  count: number;
  segments: ChartSegment[];
  title: string;
}

/**
 * The expanded line card's "reports by hour" strip: one bar per hourly bucket of the current
 * community service day (from 03:00), each scaled to the busiest hour and stacked by report type
 * — one segment per passenger status, sized by that status's share of the hour, so a bar reads as
 * its own composition instead of a single dominant colour. Segments run bottom-up NORMAL →
 * DISRUPTED (the `PASSENGER_SCALE` severity order) and sum to exactly the bar's own height.
 * Hand-rolled divs — this repo has no charting dependency, matching the fleet trend chart's
 * approach — with a hover readout line above the bars (an absolutely-positioned tooltip would be
 * clipped inside the card) and each bar's hour range, total and per-status breakdown also carried
 * by its own `title`/`aria-label`.
 *
 * All 24 hours are labelled (no every-third-hour sampling), which needs more room than a 390px
 * viewport gives: the bars + hour axis sit on a common minimum-width strip inside an
 * `overflow-x-auto` lane, so narrow screens scroll the strip instead of collapsing the labels.
 *
 * The read stays inert until `expanded` is true, mirroring the status sheet's lazy station read;
 * a parent-driven `refreshTick` beat re-issues it while the panel is open.
 */
@Component({
  selector: "app-line-status-chart",
  imports: [HlmSkeleton, RetryBannerComponent],
  template: `
    @if (expanded()) {
      <section class="flex flex-col gap-2" data-testid="line-status-chart">
        <h4 class="text-muted-foreground text-xs font-medium">Reports by hour — today</h4>
        @if (resource.isLoading()) {
          <div
            hlmSkeleton
            class="w-full"
            [class]="_stateMinHeight"
            data-testid="line-status-chart-skeleton"
          ></div>
        } @else if (resource.hasError()) {
          <app-retry-banner
            [resource]="resource"
            message="Couldn't load this line's hourly reports."
          />
        } @else if (!hasData()) {
          <p
            class="text-muted-foreground flex items-center justify-center text-center text-sm"
            [class]="_stateMinHeight"
            data-testid="line-status-chart-empty"
          >
            No reports in this service day yet.
          </p>
        } @else {
          <div class="flex flex-col gap-2" [class]="_stateMinHeight">
            <div
              class="bg-muted/50 flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2.5 py-1.5 text-xs"
              data-testid="line-status-chart-readout"
            >
              @if (hovered(); as bar) {
                <span class="font-medium">{{ bar.rangeLabel }}</span>
                <span>{{ bar.count }} report{{ bar.count === 1 ? "" : "s" }}</span>
                @for (segment of bar.segments; track segment.status) {
                  @if (segment.status; as status) {
                    <span class="flex items-center gap-1">
                      <span class="size-2 rounded-full" [class]="segment.colorClass"></span>
                      {{ _passengerLabel(status) }} {{ segment.count }}
                    </span>
                  }
                }
              } @else {
                <span class="text-muted-foreground">Hover a bar for that hour's reports.</span>
              }
            </div>

            <div class="flex gap-2">
              <div
                class="text-muted-foreground flex h-24 w-7 flex-col justify-between pb-px text-right text-[10px] tabular-nums"
                aria-hidden="true"
              >
                <span>{{ maxCount() }}</span>
                <span>{{ halfCount() }}</span>
                <span>0</span>
              </div>
              <div class="min-w-0 flex-1 overflow-x-auto">
                <div [class]="_hourAxisMinWidth">
                  <div class="relative flex h-24 items-end gap-px" (mouseleave)="hovered.set(null)">
                    <div
                      class="pointer-events-none absolute inset-0 flex flex-col justify-between"
                      aria-hidden="true"
                    >
                      @for (_ of _gridlines; track $index) {
                        <div class="border-border/60 border-t"></div>
                      }
                    </div>
                    @for (bar of bars(); track bar.hourStart) {
                      <div
                        class="relative flex h-full min-w-0 flex-1 flex-col-reverse rounded-[1px]"
                        data-testid="line-status-bar"
                        [attr.data-hour]="bar.hourLabel"
                        [title]="bar.title"
                        [attr.aria-label]="bar.title"
                        (mouseenter)="hovered.set(bar)"
                      >
                        @for (segment of bar.segments; track segment.status) {
                          <div
                            class="w-full last:rounded-t-[2px]"
                            [class]="segment.colorClass"
                            [style.height.%]="segment.heightPct"
                          ></div>
                        }
                      </div>
                    }
                  </div>
                  <div class="mt-1 flex gap-px" aria-hidden="true">
                    @for (bar of bars(); track bar.hourStart) {
                      <span
                        class="text-muted-foreground min-w-0 flex-1 text-center text-[10px] tabular-nums"
                        data-testid="line-status-tick"
                      >
                        {{ bar.tickLabel }}
                      </span>
                    }
                  </div>
                </div>
              </div>
            </div>
          </div>
        }
      </section>
    }
  `,
})
export class LineStatusChartComponent {
  readonly lineId = input.required<string>();
  /** The card's expansion state — the read stays inert (no request) until this is true. */
  readonly expanded = input.required<boolean>();
  /** Bumped by the parent's poll beat to refresh an already-open accordion. */
  readonly refreshTick = input(0);

  /** The last tick this component acted on. Seeded on the first effect pass so init never
   * re-issues the read the resource already made when `expanded` first turned true. */
  private _appliedRefreshTick: number | null = null;

  protected readonly _gridlines = [0, 1, 2];
  protected readonly _passengerLabel = passengerLabelFor;
  protected readonly _stateMinHeight = CHART_STATE_MIN_HEIGHT_CLASS;
  protected readonly _hourAxisMinWidth = HOUR_AXIS_MIN_WIDTH_CLASS;

  protected readonly hovered = signal<ChartBar | null>(null);

  protected readonly resource = graphqlResource<
    LineStatusHistoryQueryData,
    LineStatusHistoryQueryVars
  >(() => {
    if (!this.expanded()) {
      return undefined;
    }
    return {
      query: LINE_STATUS_HISTORY_QUERY,
      variables: { lineId: this.lineId(), dayStartHour: SERVICE_DAY_START_HOUR },
    };
  });

  protected readonly bars = computed<ChartBar[]>(() => {
    const buckets = this.resource.data()?.lineStatusHistory ?? [];
    const max = buckets.reduce((highest, bucket) => Math.max(highest, bucket.count), 0);
    return buckets.map((bucket) => toBar(bucket, max));
  });

  protected readonly maxCount = computed(() =>
    this.bars().reduce((highest, bar) => Math.max(highest, bar.count), 0),
  );

  protected readonly halfCount = computed(() => Math.ceil(this.maxCount() / 2));

  protected readonly hasData = computed(() => this.bars().some((bar) => bar.count > 0));

  constructor() {
    effect(() => {
      const tick = this.refreshTick();
      if (this._appliedRefreshTick === null) {
        this._appliedRefreshTick = tick;
        return;
      }
      if (tick === this._appliedRefreshTick) {
        return;
      }
      this._appliedRefreshTick = tick;
      if (this.expanded()) {
        this.resource.reload();
      }
    });
  }
}

function toBar(bucket: LineStatusHourBucket, max: number): ChartBar {
  const hourLabel = HOUR_LABEL.format(new Date(bucket.hourStart));
  const endLabel = HOUR_LABEL.format(new Date(bucket.hourEnd));
  const rangeLabel = `${hourLabel}:00–${endLabel}:00`;
  const reports = `${bucket.count} report${bucket.count === 1 ? "" : "s"}`;
  const barHeightPct =
    max === 0 || bucket.count === 0 ? 0 : Math.max((bucket.count / max) * 100, MIN_BAR_PERCENT);
  const segments = toSegments(bucket, barHeightPct);
  const breakdown = segments
    .map((segment) =>
      segment.status === null ? "" : `${PASSENGER_LABEL[segment.status]} ${segment.count}`,
    )
    .filter((part) => part.length > 0)
    .join(", ");
  return {
    hourStart: bucket.hourStart,
    hourLabel,
    tickLabel: hourLabel,
    rangeLabel,
    count: bucket.count,
    segments,
    title:
      breakdown.length === 0
        ? `${rangeLabel} · ${reports}`
        : `${rangeLabel} · ${reports} · ${breakdown}`,
  };
}

/**
 * Splits an hour's bar into per-status segments in `PASSENGER_SCALE` order (NORMAL → DISRUPTED).
 * Each height is that status's share of the hour applied to the bar's own height, so the segments
 * always sum to exactly `barHeightPct` — even if the backend's tallies were to drift from `count`.
 * Zero counts are dropped (the backend omits them too); a bucket with no tallies at all falls back
 * to a single segment coloured by its dominant status, and an empty hour to no segments. The
 * template renders the list with `flex-col-reverse`, so this order reads bottom-up as NORMAL at
 * the bar's base and the most severe status on top.
 */
function toSegments(bucket: LineStatusHourBucket, barHeightPct: number): ChartSegment[] {
  if (bucket.count === 0) {
    return [];
  }
  const counts = new Map<PassengerStatus, number>();
  for (const entry of bucket.statusCounts ?? []) {
    if (entry.count > 0) {
      counts.set(entry.status, (counts.get(entry.status) ?? 0) + entry.count);
    }
  }
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  if (total === 0) {
    const status = bucket.dominantStatus;
    return [
      {
        status,
        count: bucket.count,
        heightPct: barHeightPct,
        colorClass: status ? BAR_CLASS[status] : "bg-muted",
      },
    ];
  }
  return PASSENGER_SCALE.filter((status) => counts.has(status)).map((status) => {
    const count = counts.get(status) ?? 0;
    return {
      status,
      count,
      heightPct: (count / total) * barHeightPct,
      colorClass: BAR_CLASS[status],
    };
  });
}

function passengerLabelFor(status: PassengerStatus): string {
  return PASSENGER_LABEL[status];
}
