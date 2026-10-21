import { Component, computed, input, linkedSignal, signal } from "@angular/core";

import { graphqlResource } from "../../../core/graphql/graphql-client";
import { metricDoc, metricTooltip } from "../../../core/methodology/methodology-render.util";
import { InfoPopover, type InfoPopoverLink } from "../../../ui/info-popover/info-popover";
import { RetryBannerComponent } from "../../../ui/retry-banner/retry-banner.component";
import { HlmSkeleton } from "../../../ui/skeleton/skeleton";
import { HlmTableImports } from "../../../ui/table/table";
import {
  bucketIncidentsByMonth,
  historyYearSpan,
  monthKeysEndingAt,
  monthLongLabel,
  monthlyHistorySummary,
  toMonthlyBars,
  yAxisTicks,
  type MonthlyBar,
} from "../data/incident-monthly.util";
import {
  INSIDEN_MONTHLY_HISTORY_QUERY,
  type InsidenMonthlyHistoryData,
  type InsidenMonthlyHistoryVars,
  type YearFilter,
} from "../data/insiden-history.queries";

/** The registry entry this section publishes; the title and the tooltip both read it. */
const METRIC_ID = "incidents.monthly-by-severity";

/**
 * Reserved block height every state shares (skeleton, empty message, chart), so swapping between
 * them never moves what is below. Same value as the home line-status chart's reservation.
 */
const STATE_MIN_HEIGHT_CLASS = "min-h-40";

function yearFilter(year: number): YearFilter {
  return { date: { year: { exact: year } } };
}

/**
 * `/insiden`'s **"Last 12 months"** section: stacked Major / Minor bars of how many approved incidents
 * STARTED in each of the 12 months ending at the month the calendar is showing, with a table of the
 * same numbers for anyone who would rather read than look.
 *
 * **Lazy in the same way the home line-status chart is, and for the same reason.** The section opens
 * collapsed and its read stays inert until the reader opens it (`resource` returns `undefined` while
 * `expanded()` is false), so a page view that never opens it costs no request, no server-side read
 * and nothing in the SSR payload. Drawn the same way too: hand-rolled divs, bars scaled to the
 * busiest month, a hover readout line above (an absolute tooltip would be clipped by the card), and
 * each bar's detail also in its own `title`. That chart has no separate lazy-wrapper component — its
 * `expanded` input IS the wrapper — and importing it here would make `insiden` depend on `home`
 * (which already depends on insiden's link components), so the shape is repeated instead.
 *
 * **Hydration rule.** `graphqlResource` request bodies must be identical on the server and in the
 * browser, so the window comes from `endMonth` — the page's route-derived `selectedMonth`, the same
 * on both sides — and never from `new Date()`: a clock that rolls over a month between the server
 * render and hydration would otherwise ask two different questions of one page. Today the read only
 * starts after a click, in the browser, so the rule is not load-bearing yet; it is kept so that
 * opening the section by default stays safe.
 *
 * What is counted is the `incidents.monthly-by-severity` registry entry; why the read is
 * `calendarIncidents` and not `calendarIncidentsBySeverityCount` is in `insiden-history.queries.ts`.
 *
 * Accessibility: the chart is a `role="group"` named by a summary sentence (the window, the totals
 * and the peak) and every bar is a focusable button named by its own month, total and split, which
 * also drives the readout line, so a keyboard or a screen reader reaches each number the pointer can.
 * (`role="img"` would have made the buttons inside it presentational.) The table below is the
 * per-month fallback.
 */
@Component({
  selector: "app-incident-history",
  imports: [HlmSkeleton, RetryBannerComponent, InfoPopover, ...HlmTableImports],
  template: `
    <section class="flex flex-col gap-3 rounded-lg border p-4" data-testid="incident-history">
      <div class="flex items-center gap-1.5">
        <h2 class="text-sm font-semibold">
          <button
            type="button"
            class="text-muted-foreground flex cursor-pointer items-center gap-1.5 tracking-wide uppercase"
            data-testid="incident-history-toggle"
            [attr.aria-expanded]="expanded()"
            [attr.aria-controls]="expanded() ? 'incident-history-body' : null"
            (click)="expanded.set(!expanded())"
          >
            <svg
              viewBox="0 0 24 24"
              class="size-4 shrink-0 transition-transform"
              [class.rotate-180]="expanded()"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
            Last 12 months
          </button>
        </h2>
        <app-info-popover
          [label]="_metricTitle"
          [content]="_definition"
          [link]="_methodologyLink"
          testId="incident-history-popover"
        />
      </div>

      @if (expanded()) {
        <div
          id="incident-history-body"
          class="flex flex-col gap-3"
          data-testid="incident-history-body"
        >
          @if (monthKeys().length === 0) {
            <p class="text-muted-foreground text-sm" data-testid="incident-history-invalid">
              Pick a month on the calendar to see the 12 months up to it.
            </p>
          } @else if (_pending()) {
            <div
              hlmSkeleton
              class="w-full"
              [class]="_minHeight"
              data-testid="incident-history-skeleton"
            ></div>
          } @else if (resource.hasError()) {
            <app-retry-banner [resource]="resource" message="Couldn't load the incident history." />
          } @else if (!hasData()) {
            <p
              class="text-muted-foreground flex items-center justify-center text-center text-sm"
              [class]="_minHeight"
              data-testid="incident-history-empty"
            >
              No approved Major or Minor incidents started in the 12 months to {{ endLabel() }}.
            </p>
          } @else {
            <div class="flex flex-col gap-2" [class]="_minHeight">
              <ul
                class="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
                data-testid="incident-history-legend"
              >
                <li class="flex items-center gap-1.5">
                  <span class="bg-destructive size-2.5 rounded-sm" aria-hidden="true"></span>
                  Major
                </li>
                <li class="flex items-center gap-1.5">
                  <span class="size-2.5 rounded-sm bg-amber-500" aria-hidden="true"></span>
                  Minor
                </li>
                <li class="ml-auto" data-testid="incident-history-range">{{ rangeLabel() }}</li>
              </ul>

              <div
                class="bg-muted/50 flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2.5 py-1.5 text-xs"
                data-testid="incident-history-readout"
              >
                @if (hovered(); as bar) {
                  <span class="font-medium">{{ bar.label }}</span>
                  <span>{{ bar.total }} incident{{ bar.total === 1 ? "" : "s" }}</span>
                  <span class="flex items-center gap-1">
                    <span class="bg-destructive size-2 rounded-full" aria-hidden="true"></span>
                    Major {{ bar.major }}
                  </span>
                  <span class="flex items-center gap-1">
                    <span class="size-2 rounded-full bg-amber-500" aria-hidden="true"></span>
                    Minor {{ bar.minor }}
                  </span>
                } @else {
                  <span class="text-muted-foreground">
                    Hover, tap or focus a bar for that month's incidents.
                  </span>
                }
              </div>

              <div class="flex gap-2">
                <div
                  class="text-muted-foreground flex h-24 w-7 flex-col justify-between pb-px text-right text-[10px] tabular-nums"
                  aria-hidden="true"
                  data-testid="incident-history-axis"
                >
                  @for (tick of axisTicks(); track $index) {
                    <span>{{ tick }}</span>
                  }
                </div>
                <div class="min-w-0 flex-1">
                  <div
                    class="relative flex h-24 items-end gap-1"
                    role="group"
                    data-testid="incident-history-chart"
                    [attr.aria-label]="summary()"
                    (mouseleave)="hovered.set(null)"
                    (focusout)="hovered.set(null)"
                  >
                    <div
                      class="pointer-events-none absolute inset-0 flex flex-col justify-between"
                      aria-hidden="true"
                    >
                      @for (_ of _gridlines; track $index) {
                        <div class="border-border/60 border-t"></div>
                      }
                    </div>
                    @for (bar of bars(); track bar.monthKey) {
                      <button
                        type="button"
                        class="focus-visible:ring-ring/50 relative flex h-full min-w-0 flex-1 cursor-pointer flex-col-reverse rounded-[1px] outline-none focus-visible:ring-[3px]"
                        data-testid="incident-history-bar"
                        [attr.data-month]="bar.monthKey"
                        [attr.aria-label]="bar.title"
                        [title]="bar.title"
                        (mouseenter)="hovered.set(bar)"
                        (focus)="hovered.set(bar)"
                        (click)="hovered.set(bar)"
                      >
                        <!-- Spans, not divs: a button holds phrasing content. The 2px minimum keeps a
                             single incident in a busy window visible without changing its height
                             anywhere the axis could contradict it. -->
                        @if (bar.major > 0) {
                          <span
                            class="bg-destructive block min-h-[2px] w-full"
                            data-severity="major"
                            [style.height.%]="bar.majorPct"
                          ></span>
                        }
                        @if (bar.minor > 0) {
                          <span
                            class="block min-h-[2px] w-full bg-amber-500 last:rounded-t-[2px]"
                            data-severity="minor"
                            [style.height.%]="bar.minorPct"
                          ></span>
                        }
                      </button>
                    }
                  </div>
                  <div class="mt-1 flex gap-1" aria-hidden="true">
                    @for (bar of bars(); track bar.monthKey) {
                      <span
                        class="text-muted-foreground flex min-w-0 flex-1 flex-col items-center text-[10px] leading-tight tabular-nums"
                        data-testid="incident-history-tick"
                      >
                        {{ bar.tick }}
                        <span class="block min-h-[11px] text-[9px]">{{ bar.yearTick }}</span>
                      </span>
                    }
                  </div>
                </div>
              </div>

              @if (otherSeverity() > 0) {
                <p class="text-muted-foreground text-xs" data-testid="incident-history-other">
                  {{ otherSeverity() }} approved incident{{ otherSeverity() === 1 ? "" : "s" }} of
                  other severity {{ otherSeverity() === 1 ? "is" : "are" }} not shown.
                </p>
              }

              <details data-testid="incident-history-table-details">
                <summary
                  class="text-muted-foreground hover:text-foreground cursor-pointer text-xs font-medium select-none"
                >
                  View as table
                </summary>
                <div hlmTableContainer class="max-w-md">
                  <table hlmTable data-testid="incident-history-table">
                    <caption class="sr-only">
                      Approved incidents started per month, by severity
                    </caption>
                    <thead hlmTHead>
                      <tr hlmTr>
                        <th hlmTh scope="col">Month</th>
                        <th hlmTh scope="col" class="!text-end">Major</th>
                        <th hlmTh scope="col" class="!text-end">Minor</th>
                      </tr>
                    </thead>
                    <tbody hlmTBody>
                      @for (bar of bars(); track bar.monthKey) {
                        <tr
                          hlmTr
                          data-testid="incident-history-row"
                          [attr.data-month]="bar.monthKey"
                        >
                          <th hlmTh scope="row">{{ bar.label }}</th>
                          <td hlmTd class="text-end tabular-nums">{{ bar.major }}</td>
                          <td hlmTd class="text-end tabular-nums">{{ bar.minor }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          }
        </div>
      }
    </section>
  `,
})
export class IncidentHistoryComponent {
  /**
   * The month the 12-month window ends at (`YYYY-MM`) — the page's `selectedMonth`. Route state, so
   * it is identical on the server and in the browser; see the class doc for why it is the only thing
   * the request is derived from.
   */
  readonly endMonth = input.required<string>();

  /** Collapsed until the reader opens it; the read below does not exist while this is false. */
  protected readonly expanded = signal(false);
  protected readonly _gridlines = [0, 1, 2];
  protected readonly _minHeight = STATE_MIN_HEIGHT_CLASS;
  protected readonly _metricTitle = metricDoc(METRIC_ID).title;
  protected readonly _definition = metricTooltip(METRIC_ID);
  protected readonly _methodologyLink: InfoPopoverLink = {
    text: "How this is counted",
    routerLink: "/methodology",
    fragment: "episodes",
  };

  protected readonly monthKeys = computed(() => monthKeysEndingAt(this.endMonth()));

  /**
   * The calendar years the window spans, compared BY VALUE. `monthKeys()` is a fresh array for every
   * month, so a request derived from it would re-read for a month that needs no new data: the two
   * year reads cover every month of the pair, and `httpResource` treats any new request object as a
   * new request even when its contents are equal. With value equality the request function only
   * re-runs when the pair of years changes, so paging through a year re-buckets what is already
   * loaded.
   */
  private readonly yearSpan = computed(() => historyYearSpan(this.monthKeys()), {
    equal: (a, b) => a?.startYear === b?.startYear && a?.endYear === b?.endYear,
  });

  protected readonly resource = graphqlResource<
    InsidenMonthlyHistoryData,
    InsidenMonthlyHistoryVars
  >(() => {
    if (!this.expanded()) {
      return undefined;
    }
    const span = this.yearSpan();
    if (span === null) {
      return undefined;
    }
    return {
      query: INSIDEN_MONTHLY_HISTORY_QUERY,
      variables: {
        startYear: yearFilter(span.startYear),
        endYear: yearFilter(span.endYear),
        // A window that ends in December sits inside one year; the second read would repeat the first.
        sameYear: span.startYear === span.endYear,
      },
    };
  });

  /**
   * Whether an answer for the CURRENT window is still on its way. `isLoading` alone is not enough:
   * it is true for the first fetch only, and moving to another month changes the request, which
   * drops the kept payload — without the second clause the section would flash its "no incidents"
   * message while the new window loads. The clause is skipped while the resource is in its error
   * state, so a background retry shows the banner's countdown instead of re-flashing a skeleton.
   */
  protected readonly _pending = computed(
    () =>
      this.resource.isLoading() ||
      (this.resource.isFetching() &&
        !this.resource.hasError() &&
        this.resource.data() === undefined),
  );

  private readonly history = computed(() => {
    const data = this.resource.data();
    return bucketIncidentsByMonth(
      [...(data?.startYearIncidents ?? []), ...(data?.endYearIncidents ?? [])],
      this.monthKeys(),
    );
  });

  protected readonly bars = computed(() => toMonthlyBars(this.history().rows));

  /** The bar under the pointer (or last tapped), mirrored into the readout line. A linkedSignal so a
   * new window — another month, a retry — clears it instead of reading out a bar that is gone. */
  protected readonly hovered = linkedSignal<MonthlyBar[], MonthlyBar | null>({
    source: this.bars,
    computation: () => null,
  });
  protected readonly otherSeverity = computed(() => this.history().otherSeverity);
  protected readonly hasData = computed(() => this.bars().some((bar) => bar.total > 0));
  protected readonly summary = computed(() => monthlyHistorySummary(this.history().rows));

  protected readonly axisTicks = computed(() =>
    yAxisTicks(this.bars().reduce((highest, bar) => Math.max(highest, bar.total), 0)),
  );

  /** "November 2025 – October 2026". */
  protected readonly rangeLabel = computed(() => {
    const keys = this.monthKeys();
    const first = keys[0];
    const last = keys[keys.length - 1];
    return first === undefined || last === undefined
      ? ""
      : `${monthLongLabel(first)} – ${monthLongLabel(last)}`;
  });

  /** "October 2026" — the month the window ends at. */
  protected readonly endLabel = computed(() => {
    const last = this.monthKeys().at(-1);
    return last === undefined ? "" : monthLongLabel(last);
  });
}
