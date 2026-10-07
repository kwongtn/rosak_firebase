import { Component, computed, inject, signal } from "@angular/core";
import { Router } from "@angular/router";
import { NgIcon, provideIcons } from "@ng-icons/core";
import {
  lucideCircleSlash,
  lucideLink,
  lucideOctagonX,
  lucideTrainFront,
  lucideTriangleAlert,
  lucideClock,
} from "@ng-icons/lucide";

import { injectIsBrowser } from "../../../core/composables/is-browser";
import { PreferencesService } from "../../../core/preferences/preferences.service";
import { HlmButton } from "../../../ui/button/button";
import { HlmInput } from "../../../ui/input/input";
import { HlmSheet, HlmSheetBody, HlmSheetFooter, HlmSheetHeader } from "../../../ui/sheet/sheet";
import { IncidentSheetService } from "../../insiden/data/incident-sheet.service";
import { LinkSheetService } from "../../insiden/data/link-sheet.service";
import { ReportSheetService } from "../../spotting/data/report-sheet.service";
import { HomeStore } from "../data/home.store";
import type { LinePulse } from "../data/home.queries";
import { LineStatusSheetService } from "../data/line-status-sheet.service";
import { passengerLabel } from "../data/passenger-status.util";
import { filterChooserLines, orderChooserLines } from "./report-chooser-order.util";
import { ReportChooserService, ReportIntent, isLineIntent } from "./report-chooser.service";

/** One tile. The `testId` suffix is what the sheet's `chooser-tile-*` testid is built from. */
interface ChooserTile {
  readonly intent: ReportIntent;
  readonly testId: string;
  readonly icon: string;
  readonly label: string;
  readonly hint: string;
  /** True when the tile cannot dispatch without naming a line first. */
  readonly needsLine: boolean;
}

/**
 * Exactly five tiles, and no more. Each maps onto ONE existing submission surface, which is the whole
 * reason this is a chooser rather than a form: the app already has four write paths and this only has
 * to make them reachable from a rider's vocabulary.
 *
 * The hints are deliberately operational ("Trains aren't moving") rather than cheerful: the reader is
 * deciding between them under time pressure, and a hint that restates the label tells them nothing.
 */
const TILES: readonly ChooserTile[] = [
  {
    intent: "delay",
    testId: "delay",
    icon: "lucideClock",
    label: "Delay / crowding",
    hint: "How the line is running right now",
    needsLine: true,
  },
  {
    intent: "stopped",
    testId: "stopped",
    icon: "lucideOctagonX",
    label: "Stopped",
    hint: "Trains aren't moving on this line",
    needsLine: true,
  },
  {
    intent: "spot",
    testId: "spot",
    icon: "lucideTrainFront",
    label: "Spot a train",
    hint: "Log a sighting — platform, delay, condition",
    needsLine: true,
  },
  {
    intent: "link",
    testId: "link",
    icon: "lucideLink",
    label: "Share a link",
    hint: "News, tweets or announcements",
    needsLine: false,
  },
  {
    intent: "incident",
    testId: "incident",
    icon: "lucideTriangleAlert",
    label: "Report an incident",
    hint: "Signal faults, breakdowns, crashes",
    needsLine: false,
  },
];

/**
 * The front page's ONE submission surface: five intent tiles, then — for the three intents that are
 * about a specific line — a picker.
 *
 * It reads **no request of its own**: the line list comes off `HomeStore.lines()`, the read the board
 * below already made, so the chooser cannot add latency to a page whose whole argument is that it
 * updates itself. The order it lists them in is the visible prefill — pinned, then recently touched,
 * then worst — so a reader with two pinned lines does not have to hunt.
 *
 * 🔴 **Every tile dispatches to a sheet that already exists.** "Delay / crowding" opens the
 * line-status sheet with no preset (the reader picks the condition); "Stopped" opens the SAME sheet
 * with the existing `DISRUPTED` status pre-selected, because "stopped" is a rider's word for that
 * status and not a ninth PassengerStatus; "Spot a train" opens the spotting sheet scoped to the line;
 * "Share a link" and "Report an incident" open the two shared root-level sheets and need no line at
 * all. Nothing here writes a document, invents a status, or stubs a response shape.
 *
 * 🔴 **The incident tile is the one intent that navigates.** Its sheet is HOSTED BY `/insiden`, not
 * here — but `IncidentSheetService` is root-provided, so opening it BEFORE the navigation is what
 * makes the sheet already open on arrival instead of the reader arriving at a page and having to
 * press the button a second time.
 *
 * Ordering constraint this component cannot express alone: it must be MOUNTED BEFORE any sheet it
 * opens (`home.page.ts` places it first, and its spec pins that). `HlmSheet` locks page scroll from
 * an effect keyed on its own `open()`, and effects flush in creation order — so the chooser's close
 * (unlock) has to run before the target sheet's open (lock), or the page behind a freshly-opened
 * sheet scrolls.
 */
@Component({
  selector: "app-report-chooser",
  imports: [HlmSheet, HlmSheetHeader, HlmSheetBody, HlmSheetFooter, HlmButton, HlmInput, NgIcon],
  providers: [
    provideIcons({
      lucideClock,
      lucideOctagonX,
      lucideTrainFront,
      lucideLink,
      lucideTriangleAlert,
    }),
  ],
  template: `
    <hlm-sheet
      data-testid="report-chooser"
      [open]="chooser.isOpen()"
      (openChange)="chooser.setOpen($event)"
      [side]="isDesktop() ? 'right' : 'bottom'"
    >
      <div hlmSheetHeader>
        <h2 class="text-base font-semibold" data-testid="chooser-heading">
          {{ chooser.intent() ? "Which line?" : "Report something" }}
        </h2>
        <p class="text-muted-foreground mt-1 text-sm">
          @if (chooser.intent(); as intent) {
            {{ _stepHint(intent) }}
          } @else {
            Pick what you saw — we'll take you to the right form.
          }
        </p>
      </div>

      <div hlmSheetBody>
        @if (chooser.intent(); as intent) {
          <div class="flex flex-col gap-3" data-testid="chooser-line-picker">
            <label class="flex flex-col gap-1.5 text-sm">
              <span class="sr-only">Filter lines</span>
              <input
                hlmInput
                type="search"
                class="h-11 text-base"
                placeholder="Search by code or name"
                data-testid="chooser-line-filter"
                [value]="query()"
                (input)="onQueryInput($event)"
              />
            </label>

            @if (_visibleLines().length > 0) {
              <div class="flex flex-col gap-1.5" data-testid="chooser-line-list">
                @for (line of _visibleLines(); track line.id) {
                  <button
                    type="button"
                    class="hover:bg-muted focus-visible:ring-ring/50 flex min-h-11 w-full items-center gap-2 rounded-lg border px-3 py-2 text-left outline-none focus-visible:ring-3"
                    [attr.data-testid]="'chooser-line-' + line.id"
                    [attr.aria-label]="'Report about ' + line.code + ' ' + line.displayName"
                    (click)="onLineChosen(line)"
                  >
                    <span
                      class="size-2.5 shrink-0 rounded-full"
                      [style.background-color]="line.displayColor"
                      aria-hidden="true"
                    ></span>
                    <span class="min-w-0 flex-1 truncate text-sm">
                      <span class="text-muted-foreground">{{ line.code }}</span> ·
                      {{ line.displayName }}
                    </span>
                    <span
                      class="text-muted-foreground shrink-0 text-xs"
                      data-testid="chooser-line-hint"
                    >
                      {{ _lineHint(line) }}
                    </span>
                  </button>
                }
              </div>
            } @else if (_hasLines()) {
              <p class="text-muted-foreground text-sm" data-testid="chooser-no-match">
                No line matches "{{ query() }}".
              </p>
            } @else {
              <!-- Not an error state and not a retry: the lines read has not landed (or has none).
                   Saying so is the honest answer, and the tiles stay available for the two intents
                   that do not need a line. -->
              <p class="text-muted-foreground text-sm" data-testid="chooser-empty-lines">
                No lines are loaded right now, so a line report can't be filed yet. Try again in a
                moment, or share a link in the meantime.
              </p>
            }
          </div>
        } @else {
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="chooser-tiles">
            @for (tile of TILES; track tile.intent) {
              <button
                type="button"
                class="hover:bg-muted focus-visible:ring-ring/50 flex min-h-16 items-start gap-3 rounded-lg border p-3 text-left outline-none focus-visible:ring-3"
                [attr.data-testid]="'chooser-tile-' + tile.testId"
                [disabled]="_isDisabled(tile)"
                (click)="onTile(tile.intent)"
              >
                <ng-icon
                  [name]="tile.icon"
                  class="text-brand mt-0.5 size-5 shrink-0"
                  aria-hidden="true"
                />
                <span class="flex min-w-0 flex-col gap-0.5">
                  <span class="text-sm font-semibold">{{ tile.label }}</span>
                  <span class="text-muted-foreground text-xs">{{ tile.hint }}</span>
                </span>
              </button>
            }
          </div>
          @if (!_hasLines()) {
            <p class="text-muted-foreground mt-3 text-xs" data-testid="chooser-no-lines">
              Line reports need the live line list, which hasn't loaded yet — the other two tiles
              still work.
            </p>
          }
        }
      </div>

      <div hlmSheetFooter>
        @if (chooser.intent()) {
          <button
            hlmBtn
            variant="outline"
            class="h-11"
            data-testid="chooser-back"
            (click)="chooser.backToTiles()"
          >
            Back
          </button>
        } @else {
          <button
            hlmBtn
            variant="outline"
            class="h-11"
            data-testid="chooser-close"
            (click)="chooser.setOpen(false)"
          >
            Cancel
          </button>
        }
      </div>
    </hlm-sheet>
  `,
})
export class ReportChooserComponent {
  protected readonly chooser = inject(ReportChooserService);
  protected readonly lineStatusSheet = inject(LineStatusSheetService);
  protected readonly reportSheet = inject(ReportSheetService);
  protected readonly linkSheet = inject(LinkSheetService);
  protected readonly incidentSheet = inject(IncidentSheetService);
  private readonly preferences = inject(PreferencesService);
  private readonly store = inject(HomeStore);
  private readonly router = inject(Router);
  private readonly isBrowser = injectIsBrowser();

  protected readonly TILES = TILES;

  /**
   * Read once, eagerly rather than in `afterNextRender`, for the same reason the line-status sheet
   * does it: a sheet that renders on one edge and visibly flips on the other is worse than one that
   * is briefly wrong during SSR (where `HlmSheet` mounts no panel at all until opened).
   */
  protected readonly isDesktop = signal(true);

  /** The picker's filter box. Local UI state — it never leaves the sheet. */
  protected readonly query = signal("");

  protected readonly _hasLines = computed(() => this.store.lines().length > 0);

  protected readonly _visibleLines = computed<LinePulse[]>(() =>
    filterChooserLines(
      orderChooserLines(
        this.store.lines(),
        this.preferences.pinnedLineIds(),
        this.preferences.recentLineIds(),
      ),
      this.query(),
    ),
  );

  constructor() {
    if (this.isBrowser) {
      this.isDesktop.set(window.matchMedia("(min-width: 640px)").matches);
    }
  }

  /** The one-line question the picker step is asking, so the header says something useful. */
  protected _stepHint(intent: ReportIntent): string {
    switch (intent) {
      case "delay":
        return "Which line is delayed or crowded?";
      case "stopped":
        return "Which line has stopped?";
      case "spot":
        return "Which line did you see the train on?";
      default:
        return "Pick a line.";
    }
  }

  /**
   * The compact status hint beside a line: what riders last reported, and how much of it there was.
   * Two facts, no more — the picker's job is to let a reader recognise their line in one glance, not
   * to be a second board row.
   */
  protected _lineHint(line: LinePulse): string {
    const reports = line.statusReportCount ?? 0;
    return `${passengerLabel(line.passengerStatus)} · ${reports} ${reports === 1 ? "report" : "reports"}`;
  }

  /** Only the three line-based tiles are gated, and only while there is no line list at all. */
  protected _isDisabled(tile: ChooserTile): boolean {
    return tile.needsLine && !this._hasLines();
  }

  protected onQueryInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected onTile(intent: ReportIntent): void {
    if (isLineIntent(intent)) {
      if (!this._hasLines()) {
        return;
      }
      this.chooser.choose(intent);
      return;
    }
    if (intent === "link") {
      this.linkSheet.open();
      this.chooser.setOpen(false);
      return;
    }
    // The incident sheet is hosted by /insiden, so the navigation is part of the intent, not a
    // detail: open it first (the service is root-provided) so it is already open on arrival.
    this.incidentSheet.open();
    this.chooser.setOpen(false);
    void this.router.navigate(["/insiden"]);
  }

  protected onLineChosen(line: LinePulse): void {
    const intent = this.chooser.intent();
    if (!intent) {
      return;
    }
    // Choosing a line IS looking at it, so it joins the recents — the same rule the board's row and
    // card follow on expand, and the reason the picker is ordered the way it is.
    this.preferences.pushRecentLine(line.id);
    switch (intent) {
      case "delay":
        this.lineStatusSheet.openFor(line.id);
        break;
      case "stopped":
        // The rider's word "stopped" is the existing DISRUPTED status, pre-selected so the common
        // case is one tap. It is still editable in the sheet — a "stopped" report with a different
        // condition is a correction, not a new enum member.
        this.lineStatusSheet.openFor(line.id, { presetStatus: "DISRUPTED" });
        break;
      case "spot":
        this.reportSheet.openFor(line.id);
        break;
    }
    this.chooser.setOpen(false);
  }
}
