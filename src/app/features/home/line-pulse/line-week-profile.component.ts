import { Component, computed, input, signal } from "@angular/core";
import { graphqlResource } from "../../../core/graphql/graphql-client";
import { metricTooltip } from "../../../core/methodology/methodology-render.util";
import { InfoPopover } from "../../../ui/info-popover/info-popover";
import { RetryBannerComponent } from "../../../ui/retry-banner/retry-banner.component";
import { HlmSkeleton } from "../../../ui/skeleton/skeleton";
import {
  LINE_STATUS_WEEK_PROFILE_QUERY,
  LineStatusWeekProfileQueryData,
  LineStatusWeekProfileQueryVars,
} from "../data/home-history.queries";
import type { PassengerStatus } from "../data/home.queries";
import { PASSENGER_NO_DATA_BAR_CLASS, passengerBarClass } from "../data/passenger-status.util";
import {
  SERVICE_DAY_LABEL,
  SERVICE_DAY_START_HOUR,
  heatLegendEntries,
  reportsPhrase,
} from "../data/status-history-display.util";
import {
  MIN_REPORTS_PER_WEEK_SLOT,
  WEEK_PROFILE_WEEKS,
  WeekProfileCell,
  buildWeekProfile,
} from "../data/week-profile-display.util";

/**
 * Reserved block height every state of the strip shares (loading skeleton, retry banner, the two
 * sentences and the table), so swapping between them never drags the reports list below it up or
 * down. `min-h-64` = 256px, between the loaded body's natural height at a 1280px viewport (about
 * 247px) and at 390px (about 266px, where the legend wraps to three lines), measured in Chromium. A
 * minimum and not a height, so a body that is taller than that still shows all of itself.
 */
export const WEEK_STATE_MIN_HEIGHT_CLASS = "min-h-64";

/**
 * The expanded line panel's "Typical week": for ONE line, the passenger status riders most often
 * reported in each hour of each service-day weekday over the last `WEEK_PROFILE_WEEKS` weeks, as a
 * 7-row (Monday to Sunday) by 24-column heat strip. It sits under today's hourly chart and its
 * columns run in the same order (from `SERVICE_DAY_START_HOUR`), so a rider can read "now" against
 * "usually".
 *
 * The colours are the hourly widgets' own (`passengerBarClass`). A cell with fewer than
 * `MIN_REPORTS_PER_WEEK_SLOT` reports behind it is the muted track and reads "Not enough reports",
 * never a status: two riders one evening are not a pattern, and a grey cell is no evidence of a good
 * hour. When no cell clears the minimum the strip says that in a sentence instead of drawing grey.
 *
 * The strip IS a real `<table>`: weekday row headers, hour column headers, a caption, and text in
 * every cell, so a screen reader walks it as a table. Each cell also carries a one-sentence
 * `aria-label` and drives a readout line on hover or tap, drawn BELOW the table so a readout that
 * wraps cannot move the cells under the pointer. Cells are not focusable (168 tab stops would be
 * worse than none), so the table is the keyboard and screen-reader route to the numbers.
 *
 * Every state of the body lives in ONE block (`line-week-profile-body`) with a reserved minimum
 * height, as the hourly chart's states do. A line with no reports (the backend answers `[]`), or too
 * few of them, gets a sentence, and a block that shrank from the skeleton to that one line would
 * drag the reports list up under a rider's finger. The failure banner is held in the same block.
 *
 * The read exists only while the panel is open (the host mounts this inside its expanded block), so
 * a collapsed card never pays for it. It is not re-read on the board's beat: six weeks of reports do
 * not move while a rider has a card open.
 */
@Component({
  selector: "app-line-week-profile",
  imports: [HlmSkeleton, InfoPopover, RetryBannerComponent],
  template: `
    <section class="flex flex-col gap-2" data-testid="line-week-profile">
      <div class="flex items-center gap-1.5">
        <h4 class="text-muted-foreground text-xs font-medium">Typical week</h4>
        <app-info-popover
          label="Typical week"
          testId="line-week-profile-popover"
          [content]="_definition"
          [link]="_methodologyLink"
        />
      </div>
      <!-- ONE block holds whichever state is showing and reserves the strip's height, so an answer of
           any kind (the table, a sentence, a failure) takes the place of the skeleton without moving
           the reports list below it. -->
      <div
        class="flex flex-col gap-2"
        [class]="_stateMinHeight"
        data-testid="line-week-profile-body"
      >
        @if (resource.hasError()) {
          <app-retry-banner
            class="my-auto"
            [resource]="resource"
            message="Couldn't load this line's typical week."
          />
        } @else if (profile(); as week) {
          @switch (week.state) {
            @case ("empty") {
              <p
                class="text-muted-foreground flex flex-1 items-center justify-center text-center text-sm"
                data-testid="line-week-profile-empty"
              >
                No reports in the last {{ _weeks }} weeks
              </p>
            }
            @case ("sparse") {
              <p
                class="text-muted-foreground flex flex-1 items-center justify-center text-center text-sm"
                data-testid="line-week-profile-sparse"
              >
                {{ _reportsPhrase(week.total) }} in the last {{ _weeks }} weeks, but fewer than
                {{ _minReports }} in any one hour of the week. Not enough to show a typical week
                yet.
              </p>
            }
            @default {
              <table
                class="w-full table-fixed border-separate [border-spacing:1px]"
                data-testid="line-week-profile-table"
                (mouseleave)="hovered.set(null)"
              >
                <caption class="sr-only" [textContent]="_caption"></caption>
                <colgroup>
                  <col class="w-9" />
                  <col span="24" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col" class="p-0"><span class="sr-only">Weekday</span></th>
                    @for (column of week.columns; track column.hour) {
                      <th
                        scope="col"
                        class="text-muted-foreground p-0 text-center text-[10px] font-normal whitespace-nowrap tabular-nums"
                      >
                        <span aria-hidden="true">{{ column.tick }}</span>
                        <span class="sr-only">{{ column.range }}</span>
                      </th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (day of week.days; track day.weekday) {
                    <tr data-testid="line-week-row" [attr.data-weekday]="day.weekday">
                      <th
                        scope="row"
                        class="text-muted-foreground p-0 pr-1 text-left text-[11px] font-medium whitespace-nowrap"
                      >
                        <span aria-hidden="true">{{ day.short }}</span>
                        <span class="sr-only">{{ day.name }}</span>
                      </th>
                      @for (cell of day.cells; track cell.hour) {
                        <td
                          class="h-5 rounded-[1px] p-0"
                          [class]="cell.colorClass"
                          [attr.aria-label]="cell.title"
                          [attr.data-hour]="cell.hour"
                          [attr.data-muted]="cell.muted ? '' : null"
                          data-testid="line-week-cell"
                          (mouseenter)="hovered.set(cell)"
                          (click)="hovered.set(cell)"
                        >
                          <span class="sr-only">{{ cell.text }}</span>
                        </td>
                      }
                    </tr>
                  }
                </tbody>
              </table>

              <!-- BELOW the table, never above it: the readout wraps to two or three lines for a mixed
                   hour, and a block that changes height above the cells moves them under the pointer.
                   The cell the pointer now sits on is then a different one, whose readout has another
                   height, and the table flickers between the two. Below the table the legend is what
                   moves. -->
              <div
                class="bg-muted/50 flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2.5 py-1.5 text-xs"
                aria-hidden="true"
                data-testid="line-week-profile-readout"
              >
                @if (hovered(); as cell) {
                  <span [class.text-muted-foreground]="cell.muted">{{ cell.title }}</span>
                } @else {
                  <span class="text-muted-foreground">
                    Last {{ _weeks }} weeks. Hover or tap an hour for its reports.
                  </span>
                }
              </div>

              <div
                class="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]"
                aria-hidden="true"
                data-testid="line-week-profile-legend"
              >
                @for (entry of _legend; track entry.status) {
                  <span class="flex items-center gap-1">
                    <span class="size-2 rounded-full" [class]="_swatch(entry.status)"></span>
                    {{ entry.label }}
                  </span>
                }
                <span class="flex items-center gap-1">
                  <span class="size-2 rounded-full" [class]="_mutedSwatch"></span>
                  Not enough reports
                </span>
              </div>
            }
          }
        } @else {
          <div hlmSkeleton class="w-full flex-1" data-testid="line-week-profile-skeleton"></div>
        }
      </div>
    </section>
  `,
})
export class LineWeekProfileComponent {
  readonly lineId = input.required<string>();

  protected readonly _weeks = WEEK_PROFILE_WEEKS;
  protected readonly _minReports = MIN_REPORTS_PER_WEEK_SLOT;
  protected readonly _legend = heatLegendEntries();
  protected readonly _mutedSwatch = PASSENGER_NO_DATA_BAR_CLASS;
  protected readonly _stateMinHeight = WEEK_STATE_MIN_HEIGHT_CLASS;
  protected readonly _reportsPhrase = reportsPhrase;
  protected readonly _caption =
    `Typical week for this line: the status riders most often reported in each hour of each ` +
    `weekday over the last ${WEEK_PROFILE_WEEKS} weeks. Each weekday is a service day, ` +
    `${SERVICE_DAY_LABEL}.`;

  /** The tooltip copy, from the methodology registry — never a literal in this template. */
  protected readonly _definition = metricTooltip("line-status.typical-week");
  protected readonly _methodologyLink = {
    text: "How this works",
    routerLink: "/methodology",
    fragment: "line-status",
  };

  /** The cell under the pointer (or last tapped), shown in the readout line. */
  protected readonly hovered = signal<WeekProfileCell | null>(null);

  protected readonly resource = graphqlResource<
    LineStatusWeekProfileQueryData,
    LineStatusWeekProfileQueryVars
  >(() => ({
    query: LINE_STATUS_WEEK_PROFILE_QUERY,
    variables: {
      lineId: this.lineId(),
      weeks: WEEK_PROFILE_WEEKS,
      dayStartHour: SERVICE_DAY_START_HOUR,
    },
  }));

  /** `null` until a payload answers THIS line, so a request change shows the skeleton, never "no reports". */
  protected readonly profile = computed(() => {
    const data = this.resource.data();
    return data ? buildWeekProfile(data.lineStatusWeekProfile ?? [], SERVICE_DAY_START_HOUR) : null;
  });

  protected _swatch(status: PassengerStatus): string {
    return passengerBarClass(status);
  }
}
