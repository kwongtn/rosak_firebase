import { Component, computed, input, signal } from "@angular/core";
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

/** The community service day runs 03:00 → 02:00, so that's the hour the backend buckets from. */
export const SERVICE_DAY_START_HOUR = 3;

/** Bar fill per dominant status — the same palette vocabulary the fleet trend chart uses. */
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
const TICK_EVERY_HOURS = 3;

interface ChartBar {
  hourStart: string;
  hourLabel: string;
  tickLabel: string;
  rangeLabel: string;
  count: number;
  dominantStatus: PassengerStatus | null;
  heightPct: number;
  colorClass: string;
  title: string;
}

/**
 * The expanded line card's "reports by hour" strip: one bar per hourly bucket of the current
 * community service day (from 03:00), scaled to the busiest hour, coloured by the hour's
 * dominant passenger status. Hand-rolled divs — this repo has no charting dependency, matching
 * the fleet trend chart's approach — with a hover readout line above the bars (an
 * absolutely-positioned tooltip would be clipped inside the card) and each bar's hour, count and
 * dominant status also carried by its own `title`/`aria-label`.
 *
 * The read stays inert until `expanded` is true, mirroring the status sheet's lazy station read.
 */
@Component({
  selector: "app-line-status-chart",
  imports: [HlmSkeleton, RetryBannerComponent],
  template: `
    @if (expanded()) {
      <section class="flex flex-col gap-2" data-testid="line-status-chart">
        <h4 class="text-muted-foreground text-xs font-medium">Reports by hour — today</h4>
        @if (resource.isLoading()) {
          <div hlmSkeleton class="h-24 w-full"></div>
        } @else if (resource.hasError()) {
          <app-retry-banner
            [resource]="resource"
            message="Couldn't load this line's hourly reports."
          />
        } @else if (!hasData()) {
          <p class="text-muted-foreground text-sm" data-testid="line-status-chart-empty">
            No reports in this service day yet.
          </p>
        } @else {
          <div
            class="bg-muted/50 flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2.5 py-1.5 text-xs"
            data-testid="line-status-chart-readout"
          >
            @if (hovered(); as bar) {
              <span class="font-medium">{{ bar.rangeLabel }}</span>
              <span>{{ bar.count }} report{{ bar.count === 1 ? "" : "s" }}</span>
              @if (bar.dominantStatus; as status) {
                <span class="flex items-center gap-1">
                  <span class="size-2 rounded-full" [class]="bar.colorClass"></span>
                  {{ _passengerLabel(status) }}
                </span>
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
            <div class="min-w-0 flex-1">
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
                    class="relative flex h-full min-w-0 flex-1 flex-col justify-end rounded-[1px]"
                    data-testid="line-status-bar"
                    [attr.data-hour]="bar.hourLabel"
                    [title]="bar.title"
                    [attr.aria-label]="bar.title"
                    (mouseenter)="hovered.set(bar)"
                  >
                    <div
                      class="w-full rounded-t-[2px]"
                      [class]="bar.colorClass"
                      [style.height.%]="bar.heightPct"
                    ></div>
                  </div>
                }
              </div>
              <div class="mt-1 flex gap-px" aria-hidden="true">
                @for (bar of bars(); track bar.hourStart) {
                  <span
                    class="text-muted-foreground min-w-0 flex-1 text-center text-[10px] tabular-nums"
                  >
                    {{ bar.tickLabel }}
                  </span>
                }
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

  protected readonly _gridlines = [0, 1, 2];
  protected readonly _passengerLabel = passengerLabelFor;

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
    return buckets.map((bucket, index) => toBar(bucket, index, buckets.length, max));
  });

  protected readonly maxCount = computed(() =>
    this.bars().reduce((highest, bar) => Math.max(highest, bar.count), 0),
  );

  protected readonly halfCount = computed(() => Math.ceil(this.maxCount() / 2));

  protected readonly hasData = computed(() => this.bars().some((bar) => bar.count > 0));
}

function toBar(bucket: LineStatusHourBucket, index: number, total: number, max: number): ChartBar {
  const hourLabel = HOUR_LABEL.format(new Date(bucket.hourStart));
  const endLabel = HOUR_LABEL.format(new Date(bucket.hourEnd));
  const rangeLabel = `${hourLabel}:00–${endLabel}:00`;
  const dominantStatus = bucket.dominantStatus;
  const reports = `${bucket.count} report${bucket.count === 1 ? "" : "s"}`;
  return {
    hourStart: bucket.hourStart,
    hourLabel,
    tickLabel: index % TICK_EVERY_HOURS === 0 || index === total - 1 ? hourLabel : "",
    rangeLabel,
    count: bucket.count,
    dominantStatus,
    heightPct:
      max === 0 || bucket.count === 0 ? 0 : Math.max((bucket.count / max) * 100, MIN_BAR_PERCENT),
    colorClass: dominantStatus ? BAR_CLASS[dominantStatus] : "bg-muted",
    title: dominantStatus
      ? `${rangeLabel} · ${reports} · ${PASSENGER_LABEL[dominantStatus]}`
      : `${rangeLabel} · ${reports}`,
  };
}

function passengerLabelFor(status: PassengerStatus): string {
  return PASSENGER_LABEL[status];
}
