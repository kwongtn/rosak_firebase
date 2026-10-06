import { Component, OnDestroy, computed, effect, inject, input, signal } from "@angular/core";
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
import { networkTone, summarizeNetwork } from "../data/network-summary.util";
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
 * landed). Both inject `HomeStore` themselves, so the hero holds no store of its own and starts no
 * timer either — the beat everything follows is the page's. The rolled-up numbers live
 * in the pure `summarizeNetwork`, not here, so the same rule can be reused by the board's ordering
 * and unit-tested without a DOM.
 *
 * 🔴 **The top edge is the STATUS LINE, not decoration.** A full-width, STATIC hairline wears the
 * network's own tone (see `networkTone`) — no countdown, no width animation; the poll beat's
 * indicator is the donut inside `app-home-refresh-control` on the headline row below — and the
 * headline beside it wears the same tone as text. One colour, one sentence, one rule — so the
 * fastest thing a returning rider sees before reading anything is already the answer. Both edge
 * lines are clipped by a card-shaped overlay rather than by the card, whose `overflow-hidden` would
 * cut the popover panels below it off (see `ui/info-popover`).
 *
 * The CTA row is **intent-based**, not feature-based: "Report a delay" is what somebody standing
 * on a platform is trying to do, and it is the one action this page is best at. It opens the
 * report chooser (`ReportChooserService`, root-provided and hosted by the page) rather than acting
 * itself or scrolling — the reader who clicked it is on a platform, not reading the board, so
 * choosing WHICH line is the chooser's job, not theirs. "Spot a train" and "Share a link" stay
 * direct because they need no line, and the incident intent (which the chooser also offers) is not
 * duplicated here: the hero row is the four things you can do from the front page without leaving
 * it. Every CTA wears the DEFAULT theme rather than brand orange — the page's identity is carried
 * by type and layout, so a coloured button is not what makes it recognisable.
 *
 * The headline carries an `app-info-popover` because it is a metric, not a caption: its copy comes
 * from the methodology registry (`network.lines-normal`) through `renderMethodologyCopy`, so the
 * tile and `/methodology` cannot drift. The refresh control sits on the SAME row as that headline
 * at every width (it used to be desktop-only in a bottom-right corner) because "Refreshing in 12s"
 * modifies the sentence above it — separating them put a page's liveness next to the sparkline and
 * made the reader connect them. Two of the four TILE LABELS get the same popover treatment for the
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
      class="bg-card text-card-foreground border-border relative flex flex-col gap-4 rounded-2xl border p-4 shadow-sm sm:p-6"
      aria-label="Network overview"
      data-testid="home-hero"
    >
      <!-- 🔴 ONE clipping overlay for BOTH decorative edge lines. Neither line can clip itself any
           more: each is 4px tall, and CSS clamps a corner radius to the box, so their own
           rounded-t-2xl / rounded-b-2xl collapsed to ~4px and their square-ish ends poked outside
           the card's 18px corners. This box is CARD-SIZED, so its radius is not clamped and it cuts
           both lines to the card's true silhouette. The CARD itself still does not clip — an
           overflow-hidden here would cut the popover panels below it off (see ui/info-popover) —
           which is why the overlay is a child instead. pointer-events-none so it can never swallow
           a click on anything underneath. -->
      <div
        class="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
        aria-hidden="true"
      >
        <!-- The top edge IS the status line: STATIC and full-width, wearing only the network's TONE
             (green/orange/red) — see _lineClass. It counts nothing any more: the poll beat's
             countdown indicator is the donut inside the refresh control on the headline row below,
             so this fill carries no width binding. Its only transition is the 300ms COLOUR fade
             (plus the post-change glow), which lives in the static class and in _lineClass. -->
        <div class="absolute inset-x-0 top-0 h-1">
          <span
            class="motion-reduce:transition-none block h-full transition-colors duration-300"
            [class]="_lineClass()"
            data-testid="hero-status-line"
          ></span>
        </div>

        <!-- The network's own colours as a hairline ribbon along the bottom edge, one segment per
             line in the backend's order. 🔴 Decorative and aria-hidden: it is a fingerprint of the
             read, not information — the line count and identities are already in the tiles and the
             board below, and announcing sixteen colour swatches would be noise. A blank/absent
             displayColor is dropped rather than rendered as a transparent gap, so a line that has no
             colour cannot leave a hole in the ribbon. -->
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
      </div>

      <div class="flex flex-col gap-1.5">
        <!-- ONE row: the sentence, its "i", and the countdown that sentence is waiting on. They were
             a top-left / bottom-right pair before, which on a phone read as two unrelated blocks and
             left the mid widths with the refresh control hidden entirely. -->
        <div class="flex items-start justify-between gap-3">
          <app-info-popover
            label="Lines running normally"
            [content]="_headlineMetric()"
            [link]="_methodologyLink"
            testId="hero-headline-popover"
            iconPosition="end"
            triggerClasses="cursor-help min-w-0"
          >
            <!-- 🔴 The page's ONLY h1, and it belongs to the one sentence that describes the whole
                 network. The board's group headings, the card titles and the feed's day labels are
                 all h2/h3 UNDER it, so a screen reader's heading list is "what is the network doing"
                 followed by "which parts need attention" rather than a page of peers with no parent.
                 Its colour is the network TONE, read from the same two counts as the words. -->
            <h1
              class="text-xl font-semibold tracking-tight sm:text-2xl"
              [class]="_headlineClass()"
              data-testid="hero-headline"
            >
              {{ _summary().headline }}
            </h1>
          </app-info-popover>
          <!-- 🔴 Only the WRAPPER moved. The countdown, the "Updating" label, the transient "Updated"
               confirmation and the click arm all still live inside HomeRefreshControlComponent — a
               second copy of that state machine in the hero would double every confirmation and
               desync the two from the one beat they share. Un-gated by width: the sticky mobile
               action bar's own Refresh button drives the SAME beat, but the sentence above needs to
               say how fresh it is everywhere. -->
          <div class="shrink-0 pt-0.5" data-testid="hero-refresh-slot">
            <app-home-refresh-control />
          </div>
        </div>

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
           authors no request of its own, exactly like app-home-refresh-control above. It always
           holds its height: a failed or empty read leaves a dashed placeholder rather than a hole
           in the layout, because a decorative chart is not worth a retry banner over a working
           page and is not worth a scroll shift either. -->
      <app-network-sparkline />

      <div class="flex flex-wrap items-center gap-2" data-testid="hero-actions">
        <!-- 🔴 Opens the report CHOOSER, not the line-status sheet. "Report a delay" names an
             INTENT, and the reader is standing on a platform without the board's line list in front
             of them — sending them to a sheet that needs a line id, or (as this used to) scrolling
             them to a board to hunt for a row, both answered a question they did not ask. The
             chooser asks "which line?" itself and hands the sheet a seeded line. -->
        <button hlmBtn data-testid="hero-report-delay" (click)="chooser.open()">
          Report a delay
        </button>
        <button hlmBtn variant="outline" data-testid="hero-spot-train" (click)="reportSheet.open()">
          Spot a train
        </button>
        <button hlmBtn variant="outline" data-testid="hero-share-link" (click)="linkSheet.open()">
          Share a link
        </button>
        <a hlmBtn variant="ghost" routerLink="/tracker" data-testid="hero-live-map">Live map</a>
      </div>
    </section>
  `,
})
export class HomeHeroComponent implements OnDestroy {
  /** The same pulse list the board below renders — an input, never a second read. */
  readonly lines = input.required<LinePulse[]>();
  /** Today's approved link count, straight off the feed read's own `totalCount`. */
  readonly linksToday = input(0);

  protected readonly reportSheet = inject(ReportSheetService);
  protected readonly linkSheet = inject(LinkSheetService);
  protected readonly chooser = inject(ReportChooserService);

  protected readonly _summary = computed(() => summarizeNetwork(this.lines()));

  /**
   * How the whole network is doing, from the SAME two numbers the headline sentence uses — the
   * in-service ones, so a closed or pre-opening line cannot make the page look broken and every
   * number below the sentence agrees with it. `normalCount + needsAttentionCount` IS the in-service
   * total (both counts are in-service scoped since the Others bucket landed): out-of-service lines
   * appear in neither, and the callout below can never name one.
   *
   * The rule itself is pure and lives in `network-summary.util`; only the class maps live here,
   * because which shade of orange is a design decision rather than a fact about the network.
   */
  protected readonly _tone = computed(() => {
    const summary = this._summary();
    return networkTone(
      summary.normalCount + summary.needsAttentionCount,
      summary.needsAttentionCount,
    );
  });

  /** The headline's text tone, dark-mode aware. Literal class strings — Tailwind must see them. */
  protected readonly _headlineClass = computed(() => {
    switch (this._tone()) {
      case "normal":
        return "text-green-600 dark:text-green-400";
      case "degraded":
        return "text-orange-600 dark:text-orange-400";
      case "critical":
        return "text-red-600 dark:text-red-400";
      default:
        return "text-foreground";
    }
  });

  /**
   * Whether the fill is in its post-change GLOW window (see the `_tone` effect below).
   *
   * `icon-glow` is a box-shadow pulse coloured by `currentColor`, so the fill has to carry a
   * matching `text-*` tone beside its `bg-*` one — hence the TEXT classes below. It is not
   * `animate-breathe`: that keyframe scales, which would visibly breathe the full-width bar itself.
   */
  private readonly _toneGlow = signal(false);

  /** 🔴 How long the glow lasts after a tone change, in ms. Two `icon-glow` pulses (2.5s each). */
  private static readonly _GLOW_MS = 5000;
  private _glowTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Glow the fill for 5s after every tone CHANGE, and only on a change: the first run glows only if
   * the tone is already real (an `unknown` first read is an empty read, not a network event), and
   * every later run glows when the tone differs from the one before it.
   *
   * The TIMEOUT drives the duration, not the class — the animation is `infinite`, so nothing about
   * the class itself would ever end the glow.
   */
  constructor() {
    let previous: string | null = null;
    effect(() => {
      const tone = this._tone();
      const changed = previous === null ? tone !== "unknown" : tone !== previous;
      previous = tone;
      if (!changed) {
        return;
      }
      this._toneGlow.set(true);
      clearTimeout(this._glowTimer);
      this._glowTimer = setTimeout(() => this._toneGlow.set(false), HomeHeroComponent._GLOW_MS);
    });
  }

  ngOnDestroy(): void {
    clearTimeout(this._glowTimer);
  }

  /**
   * The status line's fill: the network's TONE and nothing else — green/orange/red, neutral before
   * the first read — plus the glow class while `_toneGlow` is on. Each tone carries BOTH a
   * background and the matching TEXT colour, because the glow's box-shadow is drawn in
   * `currentColor`. Full-width and static otherwise, so this class is the whole binding; the
   * countdown indicator is the donut inside the refresh control on the headline row, not this line.
   */
  protected readonly _lineClass = computed(() => {
    const tone = (() => {
      switch (this._tone()) {
        case "normal":
          return "bg-green-500 text-green-500";
        case "degraded":
          return "bg-orange-500 text-orange-500";
        case "critical":
          return "bg-red-500 text-red-500";
        default:
          return "bg-muted-foreground/40 text-muted-foreground";
      }
    })();
    return tone + (this._toneGlow() ? " motion-safe:animate-icon-glow" : "");
  });

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
