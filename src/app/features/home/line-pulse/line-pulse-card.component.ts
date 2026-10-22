import { Component, computed, inject, input } from "@angular/core";
import { NgIcon, provideIcons } from "@ng-icons/core";
import { lucidePin } from "@ng-icons/lucide";
import { RouterLink } from "@angular/router";
import { LineStatusBadge } from "../../../domain-ui/line-status-badge/line-status-badge";
import { HlmBadge } from "../../../ui/badge/badge";
import { HlmButton } from "../../../ui/button/button";
import { InfoPopover } from "../../../ui/info-popover/info-popover";
import { faviconHostnameOf } from "../../insiden/data/social-link.util";
import { humanizeSince } from "../../spotting/data/humanize-since.util";
import { LinePulse } from "../data/home-board.queries";
import { injectLinePulseView } from "../data/line-pulse-view";
import { LineStatusSheetService } from "../data/line-status-sheet.service";
import { passengerLabel, passengerVariant } from "../data/passenger-status.util";
import { lineStatusInfo, passengerInfo, passengerScale } from "../data/status-info.util";
import { LineNoticesComponent } from "./line-notices.component";
import { LineStatusChartComponent } from "./line-status-chart.component";
import { LineStatusReportsComponent } from "./line-status-reports.component";
import { LineWeekProfileComponent } from "./line-week-profile.component";
import { StatusInfoChipComponent } from "./status-info-chip.component";

/** Related links are a supporting signal on the card — never a feed of their own. */
const MAX_PULSE_LINKS = 5;

/**
 * The per-line pulse card of the community front page: what a line looks like right now
 * (vehicle counts + passenger status + the social entries behind it) plus the actions that keep
 * the data fresh and the ones that take the reader elsewhere.
 *
 * **One action set, everywhere.** The card carries the SAME three controls as the compact row —
 * pin (icon-only), "Details" (link to the line's details page) and "Report" (the mobile
 * `LineStatusSheetComponent` via `LineStatusSheetService`) — in the same order, so the board reads
 * as one control set per line no matter which group the line is in. Only the weight differs: the
 * card's Report is primary because reporting on this line is what the card exists for, while the
 * row's is outline. "Report" is the line-status report for THIS line, the action the whole board is
 * built around; the other entry points (spotting, sharing) live on their own surfaces rather than
 * competing here.
 *
 * The status chips carry a hover/tap info popover (StatusInfoChipComponent): the vehicle-count
 * pill opens the per-status breakdown, the passenger chip carries the rolling window it covers
 * and the severity legend with the per-status report counts folded in. The **confidence** and
 * passenger chips render ONLY for an Active line: a non-Active status badge (rendered only for
 * those lines — "Active" is the unremarkable default) already carries the line's story, so
 * "Unconfirmed (0 reports)" / "No data" beside it is noise. Where the status is unremarkable the
 * confidence chip answers a question the other chips never did — how much to trust any of this: an
 * operator-sourced post, several corroborating riders, one person's guess, or nothing at all (the
 * pure rule is `statusConfidence`). Under the header, `app-line-notices` draws the line's Notice
 * chips when an approved incident is running on it and, for a pinned line, its Planned works. The
 * title row is
 * the expand/collapse toggle for the lazy detail panel — the hourly report chart, the typical week
 * and the recent reports list, all of which only read once expanded. Mobile-first: the card is a
 * single column with full-width, content-sized actions; from `sm:` the actions move to the right
 * of the title row. Links are plain anchors (compact) rather than link cards.
 */
@Component({
  selector: "app-line-pulse-card",
  imports: [
    HlmBadge,
    HlmButton,
    InfoPopover,
    NgIcon,
    RouterLink,
    LineNoticesComponent,
    LineStatusBadge,
    LineStatusChartComponent,
    LineStatusReportsComponent,
    LineWeekProfileComponent,
    StatusInfoChipComponent,
  ],
  providers: [provideIcons({ lucidePin })],
  template: `
    <section
      class="bg-card text-card-foreground border-border relative flex flex-col gap-3 rounded-xl border p-4 pl-5 shadow-sm"
    >
      <!-- The line's own colour as a rail down the leading edge: identification at a glance
           without recolouring the card, and it survives dark mode because it is the backend's
           hex rather than a themed token. The card no longer clips (the popovers escape its
           edge), so the rail carries the leading corners itself. -->
      <span
        class="absolute inset-y-0 left-0 w-1.5 rounded-l-xl"
        [style.background-color]="line().displayColor"
        aria-hidden="true"
      ></span>
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div class="flex min-w-0 flex-col gap-3 sm:flex-1">
          <header class="flex items-start gap-3">
            <div class="min-w-0 flex-1">
              <h3 class="min-w-0 text-base font-semibold">
                <button
                  type="button"
                  class="focus-visible:ring-ring/50 flex w-full min-w-0 items-center gap-3 rounded-md text-left outline-none focus-visible:ring-3"
                  data-testid="line-card-toggle"
                  [attr.aria-expanded]="view.expanded()"
                  [attr.aria-controls]="view.expandedPanelId()"
                  (click)="view.toggleExpanded()"
                >
                  <span
                    class="border-border size-3 shrink-0 rounded-full border"
                    [style.background-color]="line().displayColor"
                    aria-hidden="true"
                  ></span>
                  <span class="min-w-0 flex-1 truncate">
                    <span class="text-muted-foreground">{{ line().code }}</span>
                    · {{ line().displayName }}
                  </span>
                  <svg
                    viewBox="0 0 24 24"
                    class="text-muted-foreground size-4 shrink-0 transition-transform duration-150 motion-reduce:transition-none"
                    [class.rotate-180]="view.expanded()"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
              </h3>
              <div class="mt-1.5 flex flex-wrap items-center gap-2">
                @if (line().status !== "ACTIVE") {
                  <app-status-info-chip
                    [info]="lineStatusInfo(line().status)"
                    [showMethodologyLink]="false"
                  >
                    <line-status-badge [status]="line().status" />
                  </app-status-info-chip>
                }
                <!-- The confidence chip qualifies the status above it. It renders ONLY for an Active
                     line, because a non-Active status badge already tells the story on its own — and
                     "Unconfirmed (0 reports)" stacked beside "Partial Disruption" is noise, not a
                     qualification. The confidence question is asked exactly where the operational
                     status is the unremarkable default, so the chip does not restate what a badge
                     would already have said. -->
                @if (line().status === "ACTIVE") {
                  <app-status-info-chip [info]="view.confidenceInfo()">
                    <span
                      hlmBadge
                      data-testid="line-card-confidence"
                      [variant]="view.confidence().variant"
                    >
                      {{ view.confidence().label }}
                    </span>
                  </app-status-info-chip>
                  <app-status-info-chip
                    [info]="passengerInfo(line().passengerStatus)"
                    [scale]="passengerScale(line().passengerStatus, line().passengerStatusCounts)"
                    [windowMinutes]="_passengerWindowMinutes()"
                    linkFragment="sightings"
                  >
                    <span
                      hlmBadge
                      data-testid="passenger-status"
                      [variant]="passengerVariant(line().passengerStatus)"
                    >
                      {{ passengerLabel(line().passengerStatus) }}
                    </span>
                  </app-status-info-chip>
                }
                <app-status-info-chip
                  [info]="view.vehicleCountInfo()"
                  [breakdown]="view.vehicleBreakdown()"
                >
                  <span
                    hlmBadge
                    variant="secondary"
                    data-testid="line-vehicle-count"
                    [attr.aria-label]="view.vehicleCountLabel()"
                  >
                    {{ line().inServiceVehicleCount }}/{{ line().totalVehicleCount }} in service
                  </span>
                </app-status-info-chip>
              </div>
            </div>
          </header>

          <!-- The line's incident chips: a Notice for an approved incident running on this line now
               (a line that needs attention is exactly where one is most likely), and, when the reader
               pinned the line, its Planned works. A pin does not hide a broken line further down — it
               stays a card — so the card has to carry what a pinned row carries. Renders nothing
               without an answer, and the host is empty:hidden so the column's gap closes. -->
          <app-line-notices
            [lineId]="line().id"
            [lineName]="line().displayName"
            [planned]="view.isPinned()"
          />

          @if (_links().length > 0) {
            <ul class="flex flex-col gap-1.5">
              @for (link of _links(); track link.id) {
                <li>
                  <a
                    [href]="link.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="border-border hover:bg-muted/40 flex min-h-11 items-center gap-2 rounded-lg border px-2.5 py-2 text-sm transition-colors"
                  >
                    @if (_hostname(link.url); as domain) {
                      <img
                        [src]="'https://www.google.com/s2/favicons?domain=' + domain"
                        class="size-4 shrink-0 rounded-sm"
                        alt=""
                      />
                    }
                    <span class="min-w-0 flex-1 truncate">
                      {{ link.title || _hostname(link.url) || link.url }}
                    </span>
                    <span class="text-muted-foreground shrink-0 text-xs whitespace-nowrap">
                      {{ _humanizeSince(link.created) }}
                    </span>
                  </a>
                </li>
              }
            </ul>
          }
        </div>

        <!-- The unified per-line action cluster, identical on every home group (this card and the
             compact row): pin, Details, Report — in that reading order. The card's Report keeps the
             primary weight (reporting on this line is what the card exists for); the row's is
             outline. Pin sits first as an icon-only control so the two labelled actions share one
             baseline. -->
        <div class="flex flex-col items-start gap-2 sm:flex-row sm:shrink-0">
          <app-info-popover
            [label]="view.pinHintTitle()"
            [content]="view.pinHint()"
            [showIcon]="false"
            [showMethodologyLink]="false"
            [triggerTpl]="cardPinTpl"
            testId="line-card-pin-popover"
          ></app-info-popover>
          <a
            hlmBtn
            size="sm"
            variant="outline"
            [routerLink]="['/spotting', line().id, 'details']"
            [attr.aria-label]="'Details for ' + line().displayName"
            data-testid="line-card-details"
            class="w-full sm:w-auto"
          >
            Details
          </a>
          <button
            hlmBtn
            size="sm"
            [attr.aria-label]="'Report delay on ' + line().displayName"
            data-testid="submit-line-status"
            class="w-full sm:w-auto"
            (click)="sheet.openFor(line().id)"
          >
            Report
          </button>
        </div>
      </div>

      @if (view.expanded()) {
        <div
          class="border-border flex flex-col gap-4 border-t pt-3"
          [attr.id]="view.expandedPanelId()"
          data-testid="line-card-expanded"
        >
          <app-line-status-chart
            [lineId]="line().id"
            [expanded]="view.expanded()"
            [refreshTick]="refreshTick()"
          />
          <app-line-week-profile [lineId]="line().id" />
          <app-line-status-reports
            [lineId]="line().id"
            [expanded]="view.expanded()"
            [refreshTick]="refreshTick()"
          />
        </div>
      }
    </section>

    <!-- The pin button lives in a template so the shared tooltip can stamp the CONSUMER'S control as
         its trigger: it stays a real, top-level button instead of being nested inside the popover's
         own button. -->
    <ng-template #cardPinTpl>
      <button
        hlmBtn
        size="icon-sm"
        variant="ghost"
        data-testid="line-card-pin"
        [attr.aria-pressed]="view.isPinned()"
        [attr.aria-label]="view.isPinned() ? 'Unpin ' + line().code : 'Pin ' + line().code"
        (click)="view.togglePin()"
      >
        <!-- The glyph FILLS when pinned, same as the row: aria-pressed alone leaves the icon
             saying "pin available" about a pin that is already on. -->
        <ng-icon
          name="lucidePin"
          class="size-4"
          [class]="view.isPinned() ? '[&>svg]:fill-current' : ''"
          aria-hidden="true"
        />
      </button>
    </ng-template>
  `,
})
export class LinePulseCardComponent {
  readonly line = input.required<LinePulse>();
  /** The host's poll beat, forwarded to the expanded panel's chart and reports. */
  readonly refreshTick = input(0);

  protected readonly sheet = inject(LineStatusSheetService);

  protected readonly passengerLabel = passengerLabel;
  protected readonly passengerVariant = passengerVariant;
  protected readonly passengerInfo = passengerInfo;
  protected readonly passengerScale = passengerScale;
  protected readonly lineStatusInfo = lineStatusInfo;
  protected readonly _humanizeSince = humanizeSince;
  protected readonly _hostname = faviconHostnameOf;

  /**
   * The state the card shares with the compact row (expand toggle, pin, confidence, fleet copy). The
   * panel id is scoped to the line because the board mounts one card per attention line: a bare id
   * would put the same attribute on every card's panel and every toggle would resolve to the FIRST
   * one on the page. The panel stays behind its `@if` — it holds two lazy reads (the chart and the
   * reports list), so keeping it unmounted is what stops sixteen cards requesting sixteen charts on
   * load.
   */
  protected readonly view = injectLinePulseView(this.line, "line-card-expanded");

  protected readonly _links = computed(() => this.line().pulseLinks.slice(0, MAX_PULSE_LINKS));

  protected readonly _passengerWindowMinutes = computed(() =>
    this.line().passengerStatus ? this.line().statusWindowMinutes : null,
  );
}
