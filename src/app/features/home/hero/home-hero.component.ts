import { Component, computed, inject, input, output } from "@angular/core";
import { RouterLink } from "@angular/router";

import {
  metricDoc,
  renderMethodologyCopy,
} from "../../../core/methodology/methodology-render.util";
import { InfoPopover, type InfoPopoverLink } from "../../../ui/info-popover/info-popover";
import { HlmButton } from "../../../ui/button/button";
import { LinkSheetService } from "../../insiden/data/link-sheet.service";
import { ReportSheetService } from "../../spotting/data/report-sheet.service";
import type { LinePulse } from "../data/home.queries";
import { summarizeNetwork } from "../data/network-summary.util";

/**
 * The front page's hero: one honest sentence about the network, four tiles of the numbers behind
 * it, and the four things a rider actually came here to do.
 *
 * It reads NOTHING. `lines` and `linksToday` arrive as inputs from `HomePage`, which already has
 * both reads in flight (`linesResource` / the today feed's own `totalCount`), so the hero costs zero
 * additional network requests — the whole component is a projection over data the page already had.
 * The rolled-up numbers live in the pure `summarizeNetwork`, not here, so the same rule can be
 * reused by the board's ordering and unit-tested without a DOM.
 *
 * The CTA row is **intent-based**, not feature-based: "Report a delay" is what somebody standing
 * on a platform is trying to do, and it is the one action this page is best at. It emits rather
 * than acting itself, because choosing WHICH line to report about belongs to the board below (the
 * report chooser is a later wave) and a scroll is all this page owes the reader for now.
 *
 * The headline carries an `app-info-popover` because it is a metric, not a caption: its copy comes
 * from the methodology registry (`network.lines-normal`) through `renderMethodologyCopy`, so the
 * tile and `/methodology` cannot drift. SSR-safe — no browser APIs, and the popover host's
 * `ngSkipHydration` (see `ui/info-popover`) covers the projected trigger.
 */
@Component({
  selector: "app-home-hero",
  imports: [RouterLink, HlmButton, InfoPopover],
  template: `
    <section
      class="bg-card text-card-foreground border-border relative flex flex-col gap-4 overflow-hidden rounded-2xl border p-4 shadow-sm sm:p-6"
      aria-label="Network overview"
      data-testid="home-hero"
    >
      <!-- Brand orange as an accent rail, not a fill: it marks the block as the page's headline
           region without turning the card into a second brand surface. -->
      <span class="bg-brand absolute inset-x-0 top-0 h-1" aria-hidden="true"></span>

      <div class="flex flex-col gap-1.5">
        <app-info-popover
          label="Lines running normally"
          [content]="_headlineMetric()"
          [link]="_methodologyLink"
          testId="hero-headline-popover"
          triggerClasses="cursor-help"
        >
          <h2
            class="text-brand text-xl font-semibold tracking-tight sm:text-2xl"
            data-testid="hero-headline"
          >
            {{ _summary().headline }}
          </h2>
        </app-info-popover>

        @if (_summary().callout; as callout) {
          <p class="text-muted-foreground text-sm" data-testid="hero-disruption-callout">
            {{ callout }}
          </p>
        }
      </div>

      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="hero-stats">
        <div
          class="bg-muted/40 flex flex-col gap-0.5 rounded-xl px-3 py-2"
          data-testid="hero-stat-lines-normal"
        >
          <span class="text-lg leading-tight font-semibold tabular-nums">
            {{ _summary().normalCount }}
          </span>
          <span class="text-muted-foreground text-xs">Lines normal</span>
        </div>
        <div
          class="bg-muted/40 flex flex-col gap-0.5 rounded-xl px-3 py-2"
          data-testid="hero-stat-needs-attention"
        >
          <span class="text-lg leading-tight font-semibold tabular-nums">
            {{ _summary().needsAttentionCount }}
          </span>
          <span class="text-muted-foreground text-xs">Needs attention</span>
        </div>
        <div
          class="bg-muted/40 flex flex-col gap-0.5 rounded-xl px-3 py-2"
          data-testid="hero-stat-reports-now"
        >
          <span class="text-lg leading-tight font-semibold tabular-nums">
            {{ _summary().reportsNow }}
          </span>
          <span class="text-muted-foreground text-xs">Reports now</span>
        </div>
        <div
          class="bg-muted/40 flex flex-col gap-0.5 rounded-xl px-3 py-2"
          data-testid="hero-stat-links-today"
        >
          <span class="text-lg leading-tight font-semibold tabular-nums">{{ linksToday() }}</span>
          <span class="text-muted-foreground text-xs">Links today</span>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2" data-testid="hero-actions">
        <button
          hlmBtn
          class="bg-brand text-brand-foreground hover:bg-brand/85"
          data-testid="hero-report-delay"
          (click)="reportDelay.emit()"
        >
          Report a delay
        </button>
        <button hlmBtn variant="outline" data-testid="hero-spot-train" (click)="reportSheet.open()">
          Spot a train
        </button>
        <button hlmBtn variant="outline" data-testid="hero-share-link" (click)="linkSheet.open()">
          Share a link
        </button>
        <a
          hlmBtn
          variant="ghost"
          routerLink="/tracker"
          data-testid="hero-live-map"
          class="text-brand"
        >
          Live map
        </a>
      </div>
    </section>
  `,
})
export class HomeHeroComponent {
  /** The same pulse list the board below renders — an input, never a second read. */
  readonly lines = input.required<LinePulse[]>();
  /** Today's approved link count, straight off the feed read's own `totalCount`. */
  readonly linksToday = input(0);

  /** Emitted by "Report a delay"; the page scrolls to the board rather than acting here. */
  readonly reportDelay = output<void>();

  protected readonly reportSheet = inject(ReportSheetService);
  protected readonly linkSheet = inject(LinkSheetService);

  protected readonly _summary = computed(() => summarizeNetwork(this.lines()));

  /** The headline metric's definition, read from the registry — never a literal here. */
  protected readonly _headlineMetric = computed(() =>
    renderMethodologyCopy(metricDoc("network.lines-normal").definition),
  );

  /** Deep link to the methodology section that owns the headline metric. */
  protected readonly _methodologyLink: InfoPopoverLink = {
    text: "How this is counted",
    routerLink: "/methodology",
    fragment: "line-status",
  };
}
