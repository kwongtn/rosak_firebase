import { Component, computed, inject, input, output } from "@angular/core";
import { RouterLink } from "@angular/router";

import {
  metricDoc,
  renderMethodologyCopy,
} from "../../../core/methodology/methodology-render.util";
import { InfoPopover, type InfoPopoverLink } from "../../../ui/info-popover/info-popover";
import { HlmBadge } from "../../../ui/badge/badge";
import { HlmButton } from "../../../ui/button/button";
import { LinkSheetService } from "../../insiden/data/link-sheet.service";
import { ReportSheetService } from "../../spotting/data/report-sheet.service";
import type { LinePulse } from "../data/home.queries";
import { summarizeNetwork } from "../data/network-summary.util";
import { HomeRefreshControlComponent } from "../refresh-control/home-refresh-control.component";

/** One official (operator-sourced) post on the worst line, as the callout needs it. */
interface OfficialUpdate {
  /** The original post — opened in a new tab, never proxied through the community page. */
  url: string;
  /** The post's own title, or the URL when the row carried none. */
  title: string;
}

/**
 * The front page's hero: one honest sentence about the network, four tiles of the numbers behind
 * it, and the four things a rider actually came here to do.
 *
 * It reads NOTHING of its own. `lines` and `linksToday` arrive as inputs from `HomePage`, which
 * already has both reads in flight (`linesResource` / the today feed's own `totalCount`), so the
 * hero costs zero additional network requests — the whole component is a projection over data the
 * page already had. The rolled-up numbers live in the pure `summarizeNetwork`, not here, so the same
 * rule can be reused by the board's ordering and unit-tested without a DOM. (It hosts
 * `app-home-refresh-control`, which injects `HomeStore` itself — the same arrangement as the
 * page's mobile copy, and likewise no read of its own.) The rolled-up numbers live in the pure
 * `summarizeNetwork`, not here, so the same rule can be reused by the board's ordering and
 * unit-tested without a DOM.
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
  imports: [RouterLink, HlmBadge, HlmButton, HomeRefreshControlComponent, InfoPopover],
  template: `
    <section
      class="bg-card text-card-foreground border-border relative flex flex-col gap-4 overflow-hidden rounded-2xl border p-4 shadow-sm sm:p-6"
      aria-label="Network overview"
      data-testid="home-hero"
    >
      <!-- Brand orange as an accent rail, not a fill: it marks the block as the page's headline
           region without turning the card into a second brand surface. -->
      <span class="bg-brand absolute inset-x-0 top-0 h-1" aria-hidden="true"></span>

      <!-- The network's own colours as a hairline ribbon along the bottom edge, one segment per
           line in the backend's order. 🔴 Decorative and aria-hidden: it is a fingerprint of the
           read, not information — the line count and identities are already in the tiles and the
           board below, and announcing sixteen colour swatches would be noise. The brand rail above
           stays the only semantic one. A blank/absent displayColor is dropped rather than rendered
           as a transparent gap, so a line that has no colour cannot leave a hole in the ribbon. -->
      @if (_ribbon().length > 0) {
        <div
          class="absolute inset-x-0 bottom-0 flex h-1"
          data-testid="hero-ribbon"
          aria-hidden="true"
        >
          @for (color of _ribbon(); track $index) {
            <span class="flex-1" [style.background-color]="color"></span>
          }
        </div>
      }

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

        <!-- 🔴 The official-update callout comes BEFORE the disruption callout, and that order is
             the point: "the operator has announced something" is a stronger claim than "a summary of
             reports says a line is broken", and burying it underneath the derived sentence would
             invert the reader's confidence. It appears only when the WORST line needing attention
             (the same summarizeNetwork pick the callout below names) has an operator-sourced post
             among its pulse links — so it never contradicts the callout and never promotes a line
             the board is not already leading with. -->
        @if (_officialUpdate(); as official) {
          <p
            class="text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm"
            data-testid="hero-official-callout"
          >
            <span hlmBadge variant="info" data-testid="hero-official-badge">Official update</span>
            <span class="min-w-0 truncate">{{ official.title }}</span>
            <a
              class="text-brand shrink-0 underline underline-offset-2"
              [href]="official.url"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="hero-official-link"
            >
              Open original
            </a>
          </p>
        }

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

      <!-- The page's live refresh indicator, moved here from the line panel's header. It was
           already the desktop instance, gated hidden lg:flex, and it keeps that gate exactly: the
           page still renders a lg:hidden copy at the head of the mobile feed column, so there is
           exactly ONE visible countdown at any width and the two instances keep sharing the store's
           single beat. CSS-only placement, never a matchMedia probe, so the server HTML and the
           hydrated client agree.
           🔴 Only the WRAPPER moved. The countdown, the "Updating" label, the transient "Updated"
           confirmation and the click arm all still live inside HomeRefreshControlComponent — a
           second copy of that state machine in the hero would double every toast-free confirmation
           and desync the two from the one beat they share. Phase 2's FAB will revisit whether the
           mobile copy is still needed at all. -->
      <div class="hidden justify-end lg:flex">
        <app-home-refresh-control />
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

  /**
   * The network's line colours, in the backend's own order, for the decorative bottom ribbon.
   * Filtered rather than mapped straight onto the template so a line whose `displayColor` is missing
   * or blank cannot render a transparent gap that reads as a rendering fault.
   */
  protected readonly _ribbon = computed<string[]>(() =>
    this.lines()
      .map((line) => line?.displayColor)
      .filter((color): color is string => typeof color === "string" && color !== ""),
  );

  /**
   * The official update for the WORST line needing attention, or `null`.
   *
   * Scoped to the worst line rather than to "any line with an automated post" on purpose: the callout
   * immediately below names that one line, and a second callout about a healthier line would
   * contradict it. The post's own title is shown truncated beside the badge, and the link opens the
   * ORIGINAL with `target="_blank" rel="noopener noreferrer"` — a community page quoting an operator
   * must never look like the operator said it here.
   */
  protected readonly _officialUpdate = computed<OfficialUpdate | null>(() => {
    const worst = this._summary().worstLine;
    if (!worst) {
      return null;
    }
    const post = (worst.pulseLinks ?? []).find((link) => link?.isAutomated === true);
    if (!post) {
      return null;
    }
    return {
      url: post.url,
      // `title` is required on the query type, but a row can still arrive without one; the URL is
      // then the readable fallback rather than an empty chip.
      title: post.title || post.url,
    };
  });

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
