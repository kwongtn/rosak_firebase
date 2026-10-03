import { Component, computed, inject, input } from "@angular/core";
import { RouterLink } from "@angular/router";

import {
  metricDoc,
  renderMethodologyCopy,
} from "../../../core/methodology/methodology-render.util";
import { InfoPopover, type InfoPopoverLink } from "../../../ui/info-popover/info-popover";
import { HlmBadge } from "../../../ui/badge/badge";
import { HlmButton } from "../../../ui/button/button";
import { HlmTickUp } from "../../../ui/motion/tick-up.directive";
import { LinkSheetService } from "../../insiden/data/link-sheet.service";
import { ReportSheetService } from "../../spotting/data/report-sheet.service";
import type { LinePulse } from "../data/home.queries";
import { summarizeNetwork } from "../data/network-summary.util";
import { ReportChooserService } from "../report/report-chooser.service";
import { HomeRefreshControlComponent } from "../refresh-control/home-refresh-control.component";
import { NetworkSparklineComponent } from "./network-sparkline.component";

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
 * page already had. It HOSTS two components that read the store themselves rather than through
 * inputs, and both are the store's own reads rather than hero-authored ones:
 * `app-home-refresh-control` (the poll beat's countdown) and `app-network-sparkline`
 * (`HomeStore.networkHistory()` — the store's lazy service-day read, gated on the lines read having
 * landed). The rolled-up numbers live in the pure `summarizeNetwork`, not here, so the same
 * rule can be reused by the board's ordering and unit-tested without a DOM.
 *
 * The CTA row is **intent-based**, not feature-based: "Report a delay" is what somebody standing
 * on a platform is trying to do, and it is the one action this page is best at. It opens the
 * report chooser (`ReportChooserService`, root-provided and hosted by the page) rather than acting
 * itself or scrolling — the reader who clicked it is on a platform, not reading the board, so
 * choosing WHICH line is the chooser's job, not theirs. "Spot a train" and "Share a link" stay
 * direct because they need no line, and the incident intent (which the chooser also offers) is not
 * duplicated here: the hero row is the four things you can do from the front page without leaving
 * it.
 *
 * The headline carries an `app-info-popover` because it is a metric, not a caption: its copy comes
 * from the methodology registry (`network.lines-normal`) through `renderMethodologyCopy`, so the
 * tile and `/methodology` cannot drift. Two of the four TILE LABELS get the same treatment for the
 * same reason — `network.needs-attention` and `network.reports-now` are rules a reader cannot guess,
 * where "lines normal" is already the headline's sentence and "links today" is the row count of the
 * list below. SSR-safe — no browser APIs, and the popover host's `ngSkipHydration` (see
 * `ui/info-popover`) covers each projected trigger.
 */
@Component({
  selector: "app-home-hero",
  imports: [
    RouterLink,
    HlmBadge,
    HlmButton,
    HomeRefreshControlComponent,
    InfoPopover,
    NetworkSparklineComponent,
    HlmTickUp,
  ],
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
          <!-- 🔴 The page's ONLY h1, and it belongs to the one sentence that describes the whole
               network. The board's group headings, the card titles and the feed's day labels are
               all h2/h3 UNDER it, so a screen reader's heading list is "what is the network doing"
               followed by "which parts need attention" rather than a page of peers with no parent. -->
          <h1
            class="text-brand text-xl font-semibold tracking-tight sm:text-2xl"
            data-testid="hero-headline"
          >
            {{ _summary().headline }}
          </h1>
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

      <!-- The four numbers behind the headline. Each tile's figure is an hlmTickUp host, so a
           CHANGED number replays the one-shot reveal in ui/motion — and a number that has not
           changed (a quiet network, most of the time) does not move at all. The first paint never
           animates: the directive skips its own first run, which is why these tiles read as plain
           text on arrival and only announce a change afterwards. -->
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="hero-stats">
        <div
          class="bg-muted/40 flex flex-col gap-0.5 rounded-xl px-3 py-2"
          data-testid="hero-stat-lines-normal"
        >
          <span
            [hlmTickUp]="_summary().normalCount"
            class="text-lg leading-tight font-semibold tabular-nums"
          >
            {{ _summary().normalCount }}
          </span>
          <span class="text-muted-foreground text-xs">Lines normal</span>
        </div>
        <div
          class="bg-muted/40 flex flex-col gap-0.5 rounded-xl px-3 py-2"
          data-testid="hero-stat-needs-attention"
        >
          <span
            [hlmTickUp]="_summary().needsAttentionCount"
            class="text-lg leading-tight font-semibold tabular-nums"
          >
            {{ _summary().needsAttentionCount }}
          </span>
          <!-- The LABEL is the trigger, not the figure: the number has to stay a plain number (it is
               the tile's value, and an animated span already owns the value slot), while the word
               beside it is the one place a reader can ask what the rule is. showIcon off keeps the
               tile looking like a tile. 🔴 Two of the four tiles get a popover because they are the
               two that are RULES rather than counts: what "needs attention" means decides whether a
               reader trusts the board's first group, and what "reports now" counts decides whether
               they trust the number above the feed. "Lines normal" is already explained by the
               headline popover right above it, and "links today" is the row count of the list below
               — self-evident, so neither needs a fourth and fifth explanation. -->
          <app-info-popover
            label="Needs attention"
            [content]="_needsAttentionMetric"
            [link]="_methodologyLink"
            testId="hero-needs-attention-popover"
            triggerClasses="text-muted-foreground self-start text-xs"
            [showIcon]="false"
          >
            <span class="text-xs">Needs attention</span>
          </app-info-popover>
        </div>
        <div
          class="bg-muted/40 flex flex-col gap-0.5 rounded-xl px-3 py-2"
          data-testid="hero-stat-reports-now"
        >
          <span
            [hlmTickUp]="_summary().reportsNow"
            class="text-lg leading-tight font-semibold tabular-nums"
          >
            {{ _summary().reportsNow }}
          </span>
          <app-info-popover
            label="Reports now"
            [content]="_reportsNowMetric"
            [link]="_methodologyLink"
            testId="hero-reports-now-popover"
            triggerClasses="text-muted-foreground self-start text-xs"
            [showIcon]="false"
          >
            <span class="text-xs">Reports now</span>
          </app-info-popover>
        </div>
        <div
          class="bg-muted/40 flex flex-col gap-0.5 rounded-xl px-3 py-2"
          data-testid="hero-stat-links-today"
        >
          <span [hlmTickUp]="linksToday()" class="text-lg leading-tight font-semibold tabular-nums">
            {{ linksToday() }}
          </span>
          <span class="text-muted-foreground text-xs">Links today</span>
        </div>
      </div>

      <!-- The network's SHAPE over the service day, under the numbers that describe right now. It
           reads HomeStore.networkHistory() — the store owns the lazy read — so the hero still
           authors no request of its own, exactly like app-home-refresh-control below. It hides
           itself entirely when that read fails or when nothing was reported today, because a
           decorative chart is not worth a retry banner over a working page. -->
      <app-network-sparkline />

      <div class="flex flex-wrap items-center gap-2" data-testid="hero-actions">
        <!-- 🔴 Opens the report CHOOSER, not the line-status sheet. "Report a delay" names an
             INTENT, and the reader is standing on a platform without the board's line list in front
             of them — sending them to a sheet that needs a line id, or (as this used to) scrolling
             them to a board to hunt for a row, both answered a question they did not ask. The
             chooser asks "which line?" itself and hands the sheet a seeded line. -->
        <button
          hlmBtn
          class="bg-brand text-brand-foreground hover:bg-brand/85"
          data-testid="hero-report-delay"
          (click)="chooser.open()"
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

      <!-- The page's live refresh indicator, moved here from the line panel's header. It keeps the
           same hidden/lg:flex gate it was born with, and it is now the ONLY countdown instance:
           the mobile copy that used to head the feed column is gone, because the sticky mobile action
           bar (home.page.ts) carries a Refresh button that drives the SAME store.polling beat and
           is visible at exactly the widths this one is not. CSS-only placement, never a matchMedia
           probe, so the server HTML and the hydrated client agree.
           🔴 Only the WRAPPER moved. The countdown, the "Updating" label, the transient "Updated"
           confirmation and the click arm all still live inside HomeRefreshControlComponent — a
           second copy of that state machine in the hero would double every toast-free confirmation
           and desync the two from the one beat they share. -->
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

  protected readonly reportSheet = inject(ReportSheetService);
  protected readonly linkSheet = inject(LinkSheetService);
  protected readonly chooser = inject(ReportChooserService);

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

  /** 🔴 These two are not `computed` for a dependency reason but a CONSISTENCY one: they read a
   *  registry string that cannot change at runtime, and a computed would only pretend it might.
   *  Same registry, same renderer as the headline's — the whole point is that a tile's definition
   *  and `/methodology`'s sentence are literally the same string. */
  protected readonly _needsAttentionMetric = renderMethodologyCopy(
    metricDoc("network.needs-attention").definition,
  );

  protected readonly _reportsNowMetric = renderMethodologyCopy(
    metricDoc("network.reports-now").definition,
  );

  /** Deep link to the methodology section that owns the headline metric. */
  protected readonly _methodologyLink: InfoPopoverLink = {
    text: "How this is counted",
    routerLink: "/methodology",
    fragment: "line-status",
  };
}
