import { Component, ElementRef, computed, inject, input, signal } from "@angular/core";
import { NgIcon, provideIcons } from "@ng-icons/core";
import { lucideEllipsisVertical, lucidePin } from "@ng-icons/lucide";
import { RouterLink } from "@angular/router";
import {
  metricDoc,
  renderMethodologyCopy,
} from "../../../core/methodology/methodology-render.util";
import { PreferencesService } from "../../../core/preferences/preferences.service";
import { LineStatusBadge } from "../../../domain-ui/line-status-badge/line-status-badge";
import { HlmBadge } from "../../../ui/badge/badge";
import { HlmButton } from "../../../ui/button/button";
import { faviconHostnameOf } from "../../insiden/data/social-link.util";
import { humanizeSince } from "../../spotting/data/humanize-since.util";
import { ReportSheetService } from "../../spotting/data/report-sheet.service";
import { LinePulse } from "../data/home.queries";
import { LineStatusSheetService } from "../data/line-status-sheet.service";
import { passengerLabel, passengerVariant } from "../data/passenger-status.util";
import type { StatusConfidence } from "../data/status-confidence.util";
import { hasOfficialPulseLink, statusConfidence } from "../data/status-confidence.util";
import {
  StatusInfo,
  lineStatusInfo,
  passengerInfo,
  passengerScale,
  vehicleStatusRows,
} from "../data/status-info.util";
import { LineStatusChartComponent } from "./line-status-chart.component";
import { LineStatusReportsComponent } from "./line-status-reports.component";
import { StatusInfoChipComponent, StatusBreakdownRow } from "./status-info-chip.component";

/** Related links are a supporting signal on the card — never a feed of their own. */
const MAX_PULSE_LINKS = 5;

/**
 * The per-line pulse card of the community front page: what a line looks like right now
 * (vehicle counts + passenger status + the social entries behind it) plus the actions that keep
 * the data fresh and the ones that take the reader elsewhere.
 *
 * **Action hierarchy (deliberate).** Two reporting buttons, one primary and one secondary:
 * "Report status" (the thing this card exists for — the mobile `LineStatusSheetComponent` via
 * `LineStatusSheetService`) and "Log spotting" (`ReportSheetService`, whose sheet the home page
 * hosts), plus a "Details" link out to the line's details page that reads left of them so the
 * primary action stays right-most and last. The kebab keeps only pin — moving the links in there
 * was the point: a card whose two most prominent buttons were equally weighted asked the reader to
 * choose between two things, one of which matters far more than the other, and put "navigate away
 * from the board" at the same level as "tell us something".
 *
 * The kebab is built inline rather than from a shared primitive because `src/app/ui/` has no
 * dropdown/menu today; it follows the same contract `app-info-popover` established (Escape and
 * outside-click close, the trigger carries `aria-expanded`/`aria-haspopup`, the panel is
 * `role="menu"` with `role="menuitem"` children) so a real primitive can replace it later without
 * changing behaviour. Its items carry their own `focus-visible` ring for the same reason the board's
 * segmented buttons do: a hand-built menu does not inherit `hlmBtn`'s, and the one menu here is
 * reachable only from the keyboard.
 *
 * The status chips carry a hover/tap info popover (StatusInfoChipComponent): the vehicle-count
 * pill opens the per-status breakdown, the passenger chip carries the rolling window it covers
 * and the severity legend with the per-status report counts folded in. The **confidence** chip sits
 * between the status pill and the passenger chip and answers a question the other three never did —
 * how much to trust any of this: an operator-sourced post, several corroborating riders, one
 * person's guess, or nothing at all (the pure rule is `statusConfidence`). The line-status pill is
 * rendered only for non-active lines — "Active" is the unremarkable default. The title row is
 * the expand/collapse toggle for the lazy detail panel — the hourly report chart
 * and the recent reports list, both of which only read once expanded. Mobile-first: the card is a
 * single column with full-width, content-sized actions; from `sm:` the actions move to the right
 * of the title row. Links are plain anchors (compact) rather than link cards.
 */
@Component({
  selector: "app-line-pulse-card",
  imports: [
    HlmBadge,
    HlmButton,
    NgIcon,
    RouterLink,
    LineStatusBadge,
    LineStatusChartComponent,
    LineStatusReportsComponent,
    StatusInfoChipComponent,
  ],
  providers: [provideIcons({ lucideEllipsisVertical, lucidePin })],
  host: {
    "(document:keydown.escape)": "closeMenu()",
    "(document:click)": "onDocumentClick($event)",
  },
  template: `
    <section
      class="bg-card text-card-foreground border-border relative flex flex-col gap-3 rounded-xl border p-4 pl-5 shadow-sm"
    >
      <!-- The line's own colour as a rail down the leading edge: identification at a glance
           without recolouring the card, and it survives dark mode because it is the backend's
           hex rather than a themed token. The card no longer clips (the popovers and the menu
           dropdown escape its edge), so the rail carries the leading corners itself. -->
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
                  [attr.aria-expanded]="_expanded()"
                  [attr.aria-controls]="_expandedPanelId()"
                  (click)="toggleExpanded()"
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
                    [class.rotate-180]="_expanded()"
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
                <!-- The confidence chip qualifies the status above it, so it sits immediately after
                     it: "Partial Disruption · Unconfirmed (1 report)" has to read as one sentence,
                     and a confidence number parked on the far side of the row is a number the reader
                     never connects to the status. Always rendered — including the "No recent
                     reports" state — because "we know nothing" is itself something a reader acting
                     on this card needs to be told. -->
                <app-status-info-chip [info]="_confidenceInfo()">
                  <span
                    hlmBadge
                    data-testid="line-card-confidence"
                    [variant]="_confidence().variant"
                  >
                    {{ _confidence().label }}
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
                <app-status-info-chip
                  [info]="_vehicleCountInfo()"
                  [breakdown]="_vehicleBreakdown()"
                >
                  <span
                    hlmBadge
                    variant="secondary"
                    data-testid="line-vehicle-count"
                    [attr.aria-label]="_vehicleCountLabel()"
                  >
                    {{ line().inServiceVehicleCount }}/{{ line().totalVehicleCount }} in service
                  </span>
                </app-status-info-chip>
              </div>
            </div>
          </header>

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

        <div class="flex items-start gap-2 sm:shrink-0">
          <div class="flex flex-col items-start gap-2 sm:shrink-0 sm:flex-row">
            <a
              hlmBtn
              size="sm"
              variant="outline"
              [routerLink]="['/spotting', line().id, 'details']"
              data-testid="line-card-details"
              class="w-full sm:w-auto"
            >
              Details
            </a>
            <button
              hlmBtn
              size="sm"
              data-testid="submit-line-status"
              class="w-full sm:w-auto"
              (click)="sheet.openFor(line().id)"
            >
              Report status
            </button>
            <button
              hlmBtn
              size="sm"
              variant="outline"
              data-testid="add-spotting-entry"
              class="w-full sm:w-auto"
              (click)="reportSheet.openFor(line().id)"
            >
              Log spotting
            </button>
          </div>

          <!-- Everything that is not one of the visible row actions lives here, so the card's
               visible controls keep a single reading order: details, report, log, then the rest. -->
          <div class="relative">
            <button
              hlmBtn
              size="icon-sm"
              variant="ghost"
              data-testid="line-card-menu"
              [attr.aria-expanded]="_menuOpen()"
              aria-haspopup="menu"
              [attr.aria-label]="'More actions for ' + line().code"
              (click)="toggleMenu()"
            >
              <ng-icon name="lucideEllipsisVertical" class="size-4" aria-hidden="true" />
            </button>

            @if (_menuOpen()) {
              <div
                role="menu"
                aria-label="Line actions"
                class="bg-popover text-popover-foreground border-border absolute right-0 top-full z-30 mt-1 flex min-w-48 flex-col rounded-lg border p-1 shadow-md"
                data-testid="line-card-menu-panel"
              >
                <button
                  type="button"
                  role="menuitem"
                  class="hover:bg-muted focus-visible:ring-ring/50 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none focus-visible:ring-2"
                  data-testid="line-card-pin"
                  (click)="togglePin()"
                >
                  <ng-icon name="lucidePin" class="size-4 shrink-0" aria-hidden="true" />
                  {{ _isPinned() ? "Unpin this line" : "Pin this line" }}
                </button>
              </div>
            }
          </div>
        </div>
      </div>

      @if (_expanded()) {
        <div
          class="border-border flex flex-col gap-4 border-t pt-3"
          [attr.id]="_expandedPanelId()"
          data-testid="line-card-expanded"
        >
          <app-line-status-chart
            [lineId]="line().id"
            [expanded]="_expanded()"
            [refreshTick]="refreshTick()"
          />
          <app-line-status-reports
            [lineId]="line().id"
            [expanded]="_expanded()"
            [refreshTick]="refreshTick()"
          />
        </div>
      }
    </section>
  `,
})
export class LinePulseCardComponent {
  readonly line = input.required<LinePulse>();
  /** The host's poll beat, forwarded to the expanded panel's chart and reports. */
  readonly refreshTick = input(0);

  protected readonly sheet = inject(LineStatusSheetService);
  protected readonly reportSheet = inject(ReportSheetService);
  private readonly preferences = inject(PreferencesService);
  private readonly _host = inject(ElementRef<HTMLElement>);

  protected readonly passengerLabel = passengerLabel;
  protected readonly passengerVariant = passengerVariant;
  protected readonly passengerInfo = passengerInfo;
  protected readonly passengerScale = passengerScale;
  protected readonly lineStatusInfo = lineStatusInfo;
  protected readonly _humanizeSince = humanizeSince;
  protected readonly _hostname = faviconHostnameOf;

  protected readonly _expanded = signal(false);
  protected readonly _menuOpen = signal(false);

  /**
   * The id the toggle's `aria-controls` points at, and the panel's own `id`.
   *
   * Scoped to the line because the board mounts one card per attention line: a bare id would put the
   * same attribute on every card's panel and every toggle would resolve to the FIRST one on the
   * page. The panel stays behind its `@if` — it holds two lazy reads (the chart and the reports
   * list), so keeping it unmounted is what stops sixteen cards requesting sixteen charts on load.
   */
  protected readonly _expandedPanelId = computed(() => `line-card-expanded-${this.line().id}`);

  /** Reads the pin signal through a `computed`, so the kebab's label repaints on toggle. */
  protected readonly _isPinned = computed(() => this.preferences.isPinned(this.line().id));

  protected readonly _links = computed(() => this.line().pulseLinks.slice(0, MAX_PULSE_LINKS));

  protected readonly _vehicleCountInfo = computed<StatusInfo>(() => {
    const doc = metricDoc("line-pulse.vehicle-count");
    return { title: doc.title, body: renderMethodologyCopy(doc.definition) };
  });

  protected readonly _vehicleCountLabel = computed(
    () =>
      `${this.line().inServiceVehicleCount} of ${this.line().totalVehicleCount} vehicles in service`,
  );

  protected readonly _vehicleBreakdown = computed<StatusBreakdownRow[]>(() => {
    const rows = vehicleStatusRows(this.line().vehicleStatusCounts);
    if (rows.length === 0) {
      return [];
    }
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    return [
      ...rows.map((row) => ({ key: row.key, label: row.label, value: `${row.count}` })),
      { key: "TOTAL", label: "Total", value: `${total}` },
    ];
  });

  protected readonly _passengerWindowMinutes = computed(() =>
    this.line().passengerStatus ? this.line().statusWindowMinutes : null,
  );

  /**
   * How much this line's reported status can be trusted. The rule (and its four levels) is the pure
   * `statusConfidence`, so the card and the compact row cannot spell the same evidence differently.
   */
  protected readonly _confidence = computed<StatusConfidence>(() =>
    statusConfidence({
      reportCount: this.line().statusReportCount,
      passengerStatus: this.line().passengerStatus,
      status: this.line().status,
      hasOfficialPost: hasOfficialPulseLink(this.line().pulseLinks),
    }),
  );

  /**
   * The chip's popover copy, read from the methodology registry through the resolved level's own
   * `metricId` — so the panel explains the level actually on screen (an official post is explained
   * differently from a three-rider tally) and `/methodology` cannot drift from the chip.
   */
  protected readonly _confidenceInfo = computed<StatusInfo>(() => {
    const doc = metricDoc(this._confidence().metricId);
    return { title: doc.title, body: renderMethodologyCopy(doc.definition) };
  });

  protected toggleExpanded(): void {
    const opening = !this._expanded();
    this._expanded.set(opening);
    if (opening) {
      // Opening the panel IS looking at this line, so it joins the recents list the board's later
      // "jump back to a line you were reading" affordance will read. Recorded on the OPEN edge only,
      // so collapsing does not push a line nobody is looking at any further up the list.
      this.preferences.pushRecentLine(this.line().id);
    }
  }

  protected toggleMenu(): void {
    this._menuOpen.update((open) => !open);
  }

  protected closeMenu(): void {
    this._menuOpen.set(false);
  }

  /** Outside-click close. Bound on the host, so a click elsewhere on the page dismisses the panel. */
  protected onDocumentClick(event: Event): void {
    if (!this._menuOpen()) {
      return;
    }
    const target = event.target;
    if (target instanceof Node && this._host.nativeElement.contains(target)) {
      return;
    }
    this.closeMenu();
  }

  protected togglePin(): void {
    this.preferences.togglePin(this.line().id);
    this.closeMenu();
  }
}
