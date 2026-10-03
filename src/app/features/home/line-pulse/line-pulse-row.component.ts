import { Component, computed, inject, input, signal } from "@angular/core";
import { NgIcon, provideIcons } from "@ng-icons/core";
import { lucideExternalLink, lucidePin } from "@ng-icons/lucide";
import { RouterLink } from "@angular/router";

import {
  metricDoc,
  renderMethodologyCopy,
} from "../../../core/methodology/methodology-render.util";
import {
  PreferencesDensity,
  PreferencesService,
  PreferencesViewMode,
} from "../../../core/preferences/preferences.service";
import { LineStatusBadge } from "../../../domain-ui/line-status-badge/line-status-badge";
import { HlmBadge } from "../../../ui/badge/badge";
import { HlmButton } from "../../../ui/button/button";
import { LinePulse } from "../data/home.queries";
import { LineStatusSheetService } from "../data/line-status-sheet.service";
import { passengerLabel, passengerVariant } from "../data/passenger-status.util";
import { StatusInfo, lineStatusInfo } from "../data/status-info.util";
import type { StatusConfidence } from "../data/status-confidence.util";
import { hasOfficialPulseLink, statusConfidence } from "../data/status-confidence.util";
import { LineHistoryStripComponent } from "./line-history-strip.component";
import { LineStatusChartComponent } from "./line-status-chart.component";
import { LineStatusReportsComponent } from "./line-status-reports.component";
import { StatusInfoChipComponent } from "./status-info-chip.component";

/**
 * The COMPACT row of the network board — one line, one line of pixels, expandable.
 *
 * The board has two row elements on purpose and this is the one that carries the volume. The full
 * `LinePulseCardComponent` answers "tell me everything about this line", which is right for the
 * handful of lines that need attention and wrong for the other fourteen: a page of sixteen full
 * cards is a wall of chrome in which the one broken line is no longer findable. So the groups that
 * are not "Needs attention" get rows, and the expanded panel is the SAME lazy content the card shows
 * — nothing is lost, it just stops being on screen until the reader asks.
 *
 * What the row carries, in reading order: the line's colour rail (identification at a glance), its
 * code and name, the plain-language operational status and the confidence chip that says how much
 * to trust it, the rider-reported crowd, the fleet count, the report tally, and the three actions —
 * pin, report, expand. In `pro` view it adds what an operator actually wants instead of what a rider
 * scans for: the report count WITH its reporting window (so a number is never read without the span
 * it covers) and the two Line HQ links.
 *
 * **Density is presentation only.** `comfortable` / `compact` changes padding and a couple of class
 * tokens on the row — never what is counted, never which actions exist, never whether a group
 * renders. It is a preference rather than a URL param because it is a per-device reading habit
 * (a phone in a pocket, a desktop with room), not something a shared link should impose.
 *
 * The expanded panel reuses `app-line-status-chart` and `app-line-status-reports` verbatim, both
 * gated on the same `expanded` input the card passes — so an expanded row's chart and reports are
 * lazy in exactly the same way, and a `refreshTick` from the poll beat reloads them the same way.
 *
 * `app-line-history-strip` sits ABOVE the disclosure and is NOT gated on it: it is the row's answer
 * to "when was this line reported today", in 24 cells, always on screen. It reads the store's single
 * `linesStatusHistory` request (which serves every row on the page), so sixteen rows cost one read
 * rather than sixteen, and it hides itself entirely when this line reported nothing or that read
 * failed.
 *
 * `LineStatusSheetService.openFor` is the report action, the same cross-component trigger the card
 * uses. 🔴 That is the WHOLE of the report affordance here: the full "which line?" chooser is a
 * later phase, and until it lands the row's report button is exactly as honest as the card's — it
 * reports on THIS line, which is the one the reader is looking at.
 */
@Component({
  selector: "app-line-pulse-row",
  imports: [
    HlmBadge,
    HlmButton,
    NgIcon,
    RouterLink,
    LineHistoryStripComponent,
    LineStatusBadge,
    LineStatusChartComponent,
    LineStatusReportsComponent,
    StatusInfoChipComponent,
  ],
  providers: [provideIcons({ lucideExternalLink, lucidePin })],
  template: `
    <section
      class="bg-card text-card-foreground border-border relative flex flex-col overflow-hidden rounded-lg border shadow-sm"
      [class.p-3]="density() === 'comfortable'"
      [class.py-2]="density() === 'compact'"
      [class.pl-4]="density() === 'comfortable'"
      [class.pl-3.5]="density() === 'compact'"
      data-testid="line-row"
    >
      <!-- Same backend-hex accent rail as the card: identification without recolouring the row,
           and it survives dark mode because it is a colour rather than a themed token. -->
      <span
        class="absolute inset-y-0 left-0 w-1"
        [style.background-color]="line().displayColor"
        aria-hidden="true"
      ></span>

      <div class="flex items-center gap-2">
        <button
          type="button"
          class="focus-visible:ring-ring/50 flex min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-3"
          data-testid="line-row-toggle"
          [attr.aria-expanded]="_expanded()"
          [attr.aria-controls]="_expandedPanelId()"
          [attr.aria-label]="'Show detail for ' + line().code"
          (click)="toggleExpanded()"
        >
          <span
            class="border-border size-2.5 shrink-0 rounded-full border"
            [style.background-color]="line().displayColor"
            aria-hidden="true"
          ></span>
          <span class="min-w-0 flex-1 truncate text-sm">
            <span class="text-muted-foreground" data-testid="line-row-title">
              {{ line().code }}
            </span>
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

        <div class="flex shrink-0 items-center gap-1.5">
          <button
            hlmBtn
            size="icon-sm"
            variant="ghost"
            data-testid="line-row-pin"
            [attr.aria-pressed]="_isPinned()"
            [attr.aria-label]="_isPinned() ? 'Unpin ' + line().code : 'Pin ' + line().code"
            (click)="togglePin()"
          >
            <ng-icon name="lucidePin" class="size-4" aria-hidden="true" />
          </button>
          <button
            hlmBtn
            size="sm"
            variant="outline"
            data-testid="line-row-report"
            (click)="sheet.openFor(line().id)"
          >
            Report
          </button>
        </div>
      </div>

      <div class="mt-1.5 flex flex-wrap items-center gap-1.5" data-testid="line-row-chips">
        @if (line().status !== "ACTIVE") {
          <app-status-info-chip [info]="_statusInfo()" [showMethodologyLink]="false">
            <line-status-badge [status]="line().status" data-testid="line-row-status" />
          </app-status-info-chip>
        }
        <!-- The confidence chip sits NEXT TO the status it qualifies, on purpose: "Partial
             Disruption · Unconfirmed (1 report)" has to read as one sentence, and a confidence
             number parked elsewhere on the row is a number nobody connects to the status. -->
        <app-status-info-chip [info]="_confidenceInfo()">
          <span hlmBadge data-testid="line-row-confidence" [variant]="_confidence().variant">
            {{ _confidence().label }}
          </span>
        </app-status-info-chip>
        <span
          hlmBadge
          data-testid="line-row-passenger"
          [variant]="passengerVariant(line().passengerStatus)"
        >
          {{ passengerLabel(line().passengerStatus) }}
        </span>
        <span hlmBadge variant="secondary" data-testid="line-row-vehicles">
          {{ line().inServiceVehicleCount }}/{{ line().totalVehicleCount }} in service
        </span>
        <span class="text-muted-foreground text-xs" data-testid="line-row-reports">
          {{ line().statusReportCount }} reports
        </span>
      </div>

      @if (viewMode() === "pro") {
        <!-- Pro detail: the report count WITH the span it covers, plus the two Line HQ links. A bare
             count is the thing a pro reader is most likely to over-read, and the window is what
             makes it interpretable ("4 reports · 15 min window" is a busy platform; "4 reports" is
             a fact with no scale). -->
        <div class="mt-1.5 flex flex-wrap items-center gap-2" data-testid="line-row-pro">
          <span class="text-muted-foreground text-xs" data-testid="line-row-report-window">
            {{ line().statusReportCount }} reports · {{ line().statusWindowMinutes }} min window
          </span>
          <a
            class="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
            [routerLink]="['/spotting', line().id]"
            data-testid="line-row-hq"
          >
            <ng-icon name="lucideExternalLink" class="size-3" aria-hidden="true" />
            Line HQ
          </a>
          <a
            class="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
            [routerLink]="['/spotting', line().id, 'details']"
            data-testid="line-row-hq-details"
          >
            <ng-icon name="lucideExternalLink" class="size-3" aria-hidden="true" />
            Details
          </a>
        </div>
      }

      <!-- The line's own service-day shape, ABOVE the disclosure: 24 cells of "when was this line
           reported", always visible from ONE store-level read. aria-hidden with a text alternative
           (see LineHistoryStripComponent), and hidden entirely when the line reported nothing today
           or that read failed. -->
      <app-line-history-strip [lineId]="line().id" />

      @if (_expanded()) {
        <div
          class="border-border mt-2.5 flex flex-col gap-3 border-t pt-2.5"
          [attr.id]="_expandedPanelId()"
          data-testid="line-row-expanded"
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
export class LinePulseRowComponent {
  readonly line = input.required<LinePulse>();
  /** The board's poll beat, forwarded to the expanded panel's chart and reports. */
  readonly refreshTick = input(0);
  /** Presentation only — see the class doc. */
  readonly density = input<PreferencesDensity>("comfortable");
  /** Whether to draw the pro-only detail block. */
  readonly viewMode = input<PreferencesViewMode>("rider");

  protected readonly sheet = inject(LineStatusSheetService);
  private readonly preferences = inject(PreferencesService);

  protected readonly passengerLabel = passengerLabel;
  protected readonly passengerVariant = passengerVariant;

  protected readonly _expanded = signal(false);

  /**
   * The id the row toggle's `aria-controls` points at, and the panel's own `id`.
   *
   * Scoped to the line because the board mounts one row per line in TWO groups at once ("My lines"
   * and "All lines" can hold the same pinned line), so a bare id would collide and every toggle would
   * resolve to whichever copy came first in the DOM. Behind its `@if` for the same reason as the
   * card's: the panel owns two lazy reads and must not be mounted sixteen times on load.
   */
  protected readonly _expandedPanelId = computed(() => `line-row-expanded-${this.line().id}`);

  /** Reads the pin signal through a `computed`, so the toggle repaints on click. */
  protected readonly _isPinned = computed(() => this.preferences.isPinned(this.line().id));

  protected readonly _confidence = computed<StatusConfidence>(() =>
    statusConfidence({
      reportCount: this.line().statusReportCount,
      passengerStatus: this.line().passengerStatus,
      status: this.line().status,
      hasOfficialPost: hasOfficialPulseLink(this.line().pulseLinks),
    }),
  );

  /**
   * The confidence popover's copy, read from the methodology registry through the level's own
   * `metricId` — so the chip explains the level the reader is looking at rather than one generic
   * paragraph, and `/methodology` cannot drift from the row.
   */
  protected readonly _confidenceInfo = computed<StatusInfo>(() => {
    const doc = metricDoc(this._confidence().metricId);
    return { title: doc.title, body: renderMethodologyCopy(doc.definition) };
  });

  /** The operational status pill's own popover — the same lookup table the card and the hero's
   * callout read, so a status name is never spelled two ways on one screen. */
  protected readonly _statusInfo = computed<StatusInfo>(() => lineStatusInfo(this.line().status));

  protected toggleExpanded(): void {
    const opening = !this._expanded();
    this._expanded.set(opening);
    if (opening) {
      // Same rule as the card: opening the panel IS looking at this line, so it joins the recents
      // list. Recorded on the OPEN edge only, so collapsing does not push a line further up it.
      this.preferences.pushRecentLine(this.line().id);
    }
  }

  protected togglePin(): void {
    this.preferences.togglePin(this.line().id);
  }
}
