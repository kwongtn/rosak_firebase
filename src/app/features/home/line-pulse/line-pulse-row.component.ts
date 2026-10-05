import { isPlatformBrowser } from "@angular/common";
import {
  Component,
  PLATFORM_ID,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
} from "@angular/core";
import { NgIcon, provideIcons } from "@ng-icons/core";
import { lucideExternalLink, lucidePin } from "@ng-icons/lucide";
import { RouterLink } from "@angular/router";

import {
  metricDoc,
  renderMethodologyCopy,
} from "../../../core/methodology/methodology-render.util";
import {
  PreferencesService,
  PreferencesViewMode,
} from "../../../core/preferences/preferences.service";
import { LineStatusBadge } from "../../../domain-ui/line-status-badge/line-status-badge";
import { HlmBadge } from "../../../ui/badge/badge";
import { HlmButton } from "../../../ui/button/button";
import { InfoPopover } from "../../../ui/info-popover/info-popover";
import { HomeStore } from "../data/home.store";
import { LinePulse } from "../data/home.queries";
import { LineStatusSheetService } from "../data/line-status-sheet.service";
import { passengerLabel, passengerVariant } from "../data/passenger-status.util";
import { StatusInfo, lineStatusInfo } from "../data/status-info.util";
import type { StatusConfidence } from "../data/status-confidence.util";
import { hasOfficialPulseLink, statusConfidence } from "../data/status-confidence.util";
import { currentServiceBucketIndex, historyTotal } from "../data/status-history-display.util";
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
 * to trust it, the rider-reported crowd, then a SECOND strip carrying the fleet count and the report
 * tally together (see the template's note on why they are grouped, and why that is what fixes a 390px
 * phone), and the three actions — pin, report, expand. In `pro` view it adds what an operator actually
 * wants instead of what a rider scans for: the report count WITH its reporting window (so a number is
 * never read without the span it covers) and the Details link.
 *
 * **Padding is fixed, not a preference.** The row is comfortable at every viewport width: the
 * compact/choice model cost a control nobody used to save two class tokens, and the density group on
 * the board has gone with it. Presentation stays the one thing it always was — it never changes what
 * is counted, never which actions exist, never whether a group renders.
 *
 * The expanded panel reuses `app-line-status-chart` and `app-line-status-reports` verbatim, both
 * gated on the same `expanded` input the card passes — so an expanded row's chart and reports are
 * lazy in exactly the same way, and a `refreshTick` from the poll beat reloads them the same way.
 *
 * 🔴 **The report tally is read from the store's service-day buckets, not from the line.** It reads
 * `N reports (X this hour)` — the whole community service day so far, plus how much of it landed in
 * the hour we are in — because `statusReportCount` alone is a 15-minute rolling window, and on a
 * compact row a number nobody can scale is a number nobody can read. The "this hour" figure is what
 * tells a reader whether a busy total is a live crowd or the morning's residue. It reads the store's
 * single `linesStatusHistory` request (which serves every row on the page plus the Pro heat grid), so
 * sixteen rows still cost one read rather than sixteen, and it falls back to the plain rolling count
 * when there is no history to enrich — the line reported nothing this service day, or that read
 * failed, which is a quiet state rather than an error (see `HomeStore`'s failure-isolation rule).
 *
 * The pin icon FILLS itself when the row is pinned rather than only pressing: an outline that reads
 * as "available" is the one thing a pin affordance cannot afford to say about a pin that is on.
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
    InfoPopover,
    NgIcon,
    RouterLink,
    LineStatusBadge,
    LineStatusChartComponent,
    LineStatusReportsComponent,
    StatusInfoChipComponent,
  ],
  providers: [provideIcons({ lucideExternalLink, lucidePin })],
  template: `
    <section
      class="bg-card text-card-foreground border-border relative flex flex-col rounded-lg border p-3 pl-4 shadow-sm"
      data-testid="line-row"
    >
      <!-- Same backend-hex accent rail as the card: identification without recolouring the row,
           and it survives dark mode because it is a colour rather than a themed token. The row no
           longer clips (popovers escape its edge), so the rail carries the leading corners. -->
      <span
        class="absolute inset-y-0 left-0 w-1 rounded-l-lg"
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
            <!-- 🔴 The icon FILLS when the row is pinned. aria-pressed alone leaves the glyph saying
             "pin available" about a pin that is already on, and a 16px outline pin is the one
             affordance on this row a reader cannot afford to misread. The arbitrary variant reaches
             the CHILD svg because lucidePin is an outline drawing of its own, and it is a literal
             string rather than a constant because Tailwind compiles what it finds in the source. -->
            <ng-icon
              name="lucidePin"
              class="size-4"
              [class]="_isPinned() ? '[&>svg]:fill-current' : ''"
              aria-hidden="true"
            />
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
      </div>

      <!-- 🔴 The fleet count and the report count are ONE fragment, and they sit on their OWN strip.
           A 390px phone could not fit the status pill, the confidence chip ("Unconfirmed (0 reports)"), the
           passenger badge, the fleet count AND the report count on one line — so the count alone wrapped onto
           a line of its own, on EVERY row, and read as a layout fault rather than as a number.

           Grouped so the two always wrap together as a unit (they describe the same fleet, and a report count
           orphaned from "12/16 in service" says nothing on its own), and the report count is hidden below sm
           because nothing is lost by it there: the confidence chip beside it already reads "Unconfirmed (2
           reports)" / "No recent reports", and the Pro block below carries "2 reports · 15 min window". Both
           testids are unchanged, and both come back from sm up. -->
      <div class="mt-1 flex flex-wrap items-center gap-1.5" data-testid="line-row-meta">
        <span hlmBadge variant="secondary" data-testid="line-row-vehicles">
          {{ line().inServiceVehicleCount }}/{{ line().totalVehicleCount }} in service
        </span>
        <!-- 🔴 The enriched label is a METRIC, so it explains itself — but only the enriched one. The
             fallback is the plain rolling count, which has no service-day claim to defend, so wrapping
             it in a popover would attach a definition to a number it does not describe.

             The responsive tokens sit on this WRAPPER, never on the projected span and never on the
             popover's own host: InfoPopover draws its "i" glyph outside the projection, so hiding
             the span alone left a lone "i" floating beside a row with no number on it below sm —
             and hiding the HOST does not work either, because the host already carries
             "inline-flex" and .inline-flex is emitted after .hidden, so it wins the tie. A wrapper
             sets display with nothing to compete against it. -->
        @if (_reportsLabel(); as label) {
          <span class="hidden sm:inline" data-testid="line-row-reports-wrap">
            <app-info-popover
              label="What the reports count covers"
              iconPosition="end"
              [content]="_reportsDefinition()"
              testId="line-row-reports-popover"
              [showMethodologyLink]="false"
              triggerClasses="cursor-help"
            >
              <span class="text-muted-foreground text-xs" data-testid="line-row-reports">
                {{ label }}
              </span>
            </app-info-popover>
          </span>
        } @else {
          <span
            class="text-muted-foreground hidden text-xs sm:inline"
            data-testid="line-row-reports"
          >
            {{ line().statusReportCount }} reports
          </span>
        }
      </div>

      @if (viewMode() === "pro") {
        <!-- Pro detail: the report count WITH the span it covers, plus the way out to the full line.
             A bare count is the thing a pro reader is most likely to over-read, and the window is
             what makes it interpretable ("4 reports · 15 min window" is a busy platform; "4 reports"
             is a fact with no scale). -->
        <div class="mt-1.5 flex flex-wrap items-center gap-2" data-testid="line-row-pro">
          <span class="text-muted-foreground text-xs" data-testid="line-row-report-window">
            {{ line().statusReportCount }} reports · {{ line().statusWindowMinutes }} min window
          </span>
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
  /** Whether to draw the pro-only detail block. */
  readonly viewMode = input<PreferencesViewMode>("rider");

  protected readonly sheet = inject(LineStatusSheetService);
  private readonly preferences = inject(PreferencesService);
  private readonly store = inject(HomeStore);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

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

  /** This line's service-day buckets — the store's ONE per-line read, shared with the heat grid. */
  protected readonly _buckets = computed(() => this.store.linesHistoryFor(this.line().id));

  /**
   * 🔴 "Now", seeded in the browser only. `afterNextRender` does not run on the server, so SSR markup
   * never depends on the server's clock and the client's first paint is the same fallback text the
   * server sent — the hydration mismatch `PreferencesService` exists to avoid. `null` therefore means
   * both "not seeded yet" and "no current hour", and both fall back rather than guess.
   */
  private readonly _now = signal<Date | null>(null);
  /** True once the browser seed has run — the effect's "not the first pass" gate (see the ctor). */
  private _clockSeeded = false;

  /**
   * `N reports (X this hour)`, or `null` when there is no service-day history to enrich the row's
   * count with — no buckets (nothing reported this service day) or no client clock yet.
   *
   * N is the whole service day and X is the bucket `now` falls in, so the pair answers the two
   * questions a rolling 15-minute count cannot: how much has this line collected today, and how much
   * of it is happening right now.
   */
  protected readonly _reportsLabel = computed<string | null>(() => {
    const buckets = this._buckets();
    const now = this._now();
    if (buckets.length === 0 || !now) {
      return null;
    }
    const index = currentServiceBucketIndex(buckets, now);
    if (index < 0) {
      return null;
    }
    return `${historyTotal(buckets)} reports (${buckets[index].count} this hour)`;
  });

  /** The label's definition, from the methodology registry rather than a literal in this template. */
  protected readonly _reportsDefinition = computed(() =>
    renderMethodologyCopy(metricDoc("network.line-reports-summary").definition),
  );

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

  constructor() {
    if (this.isBrowser) {
      afterNextRender(() => {
        this._clockSeeded = true;
        this._now.set(new Date());
      });
    }

    // The poll beat is the only thing that moves the clock while a row sits open, and the "this hour"
    // count must follow it — a row left up across an hour boundary would otherwise keep naming the
    // hour that has passed. `_clockSeeded` is what keeps the effect OFF its first run: an effect runs
    // during change detection, i.e. BEFORE `afterNextRender`, and setting the clock there would put a
    // client-clock string in the very paint the server never produced (NG0500).
    effect(() => {
      this.refreshTick();
      if (this._clockSeeded) {
        this._now.set(new Date());
      }
    });

    // Opts the store's single per-line history read in, now that this row reads it directly. Sixteen
    // rows mount and it is still ONE request: the store owns the resource, this call only opens the
    // gate (`requestHistoryReads`).
    this.store.requestHistoryReads();
  }
}
