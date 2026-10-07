import { Component, computed, effect, inject, input } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router } from "@angular/router";

import { injectIsBrowser } from "../../../core/composables/is-browser";
import { PreferencesViewMode } from "../../../core/preferences/preferences.service";
import {
  queryParamForWrite,
  readEnumQueryParam,
  readTextQueryParam,
  writeQueryParams,
} from "../../../core/url-state/query-param.util";
import { BOARD_SORTS, BoardSort, DEFAULT_BOARD_SORT, HomeStore } from "../data/home.store";
import { HomeViewModeService } from "../data/home-view-mode.service";
import { HlmSkeleton } from "../../../ui/skeleton/skeleton";
import { NetworkHeatStripComponent } from "../pro/network-heat-strip.component";
import { LinePulseCardComponent } from "./line-pulse-card.component";
import { LinePulseRowComponent } from "./line-pulse-row.component";

/** Matches the typical above-the-fold line count, so the first paint doesn't jump. */
const SKELETON_ROWS = 3;

/** The URL param names. Named once so the read and write halves cannot drift. `?view=` is NOT one
 *  of them any more — it belongs to {@link HomeViewModeService}, which the whole page (not just this
 *  board) has to be able to ask. */
const SORT_PARAM = "sort";

/**
 * The network board: the front page's line panel, grouped the way a reader actually reads it.
 *
 * Three groups over ONE partition of the same lines read (`HomeStore` owns the rule, and its doc
 * comment states the invariant): **Needs attention** — the only group that gets the full
 * `LinePulseCardComponent`, because a broken line deserves the whole card — then **My lines** and
 * **All lines**, both of which get the compact `LinePulseRowComponent`. The partition is what makes
 * this safe: every line appears in exactly one group, so nothing is duplicated and nothing is
 * hidden, and a pinned-but-broken line stays at the top instead of also appearing under "My lines".
 *
 * The controls row is deliberately small and all state is owned elsewhere — the sort lives in the
 * store (and the URL) and the view in `HomeViewModeService` — because this component composes, it
 * does not decide.
 *
 * **URL state.** `?sort=` is read from `route.queryParamMap` (seeded from the route SNAPSHOT, so the
 * server render and the client hydration read the same value) and mirrored back through the shared
 * `writeQueryParams`, which is browser-gated because a reactive `router.navigate()` during SSR hangs
 * the render. Two rules, all inherited from the helpers rather than re-derived:
 *
 *  - **A default never appears in the URL.** `sort=severity` is written as `null`, so "no query
 *    params" and "the default sort" are one state and a plain page load carries no parameters it
 *    did not choose.
 *  - **The URL wins over the stored state.** A param that is present but unrecognisable degrades to
 *    the DEFAULT rather than to whatever the store happened to hold, matching how the rest of the app
 *    treats a bad query value.
 *
 * The write half runs in an `effect` (so a deep link, a browser back/forward and a toggle all land
 * in the same place) and is guarded against redundant navigation: if the URL already says what the
 * effective state says, it writes nothing. Without that guard, back/forward through `?sort=name`
 * would immediately re-navigate onto the parameters it came from.
 *
 * 🔴 **`?view=` is NOT this component's any more.** It moved to `HomeViewModeService` because the
 * Pro dashboard needs the same answer to decide between two page layouts, and a second copy of
 * "URL wins, else the preference" is how the two halves of one fact end up disagreeing for a
 * render. The board reads the service's `view()` and its toggle calls `setView()`, so there is
 * still exactly one writer — and the board's `?sort=` write no longer has to know about `?view=` at
 * all, which is what lets each half own its own param independently.
 *
 * **Anchors and the post-submit highlight.** Every row wrapper — in ALL THREE groups, because a
 * report can be about any line — carries a stable `id="line-<id>"` and is the thing
 * `HomeStore.highlightLine()` rings. The id is what makes "return the reader to the line they just
 * reported about" a one-line scroll (see the effect in the constructor), and the ring is a CSS
 * class rather than an animation so it degrades honestly: `motion-reduce:transition-none` leaves the
 * ring VISIBLE with no transition under `prefers-reduced-motion`, which is what a reader who asked
 * for less motion still needs — the information, not the flourish.
 *
 * **Focus visibility on the controls row.** The four segmented buttons (sort / view) are plain
 * `<button>`s rather than `hlmBtn`, because a segmented group needs a shared track and the button
 * primitive's own border and padding are the wrong shape for it. That means the primitive's
 * `focus-visible` ring does not come with them, so both groups carry it explicitly:
 * a control a keyboard reader cannot see is not reachable in any sense that matters.
 */
@Component({
  selector: "app-network-board",
  imports: [HlmSkeleton, LinePulseCardComponent, LinePulseRowComponent, NetworkHeatStripComponent],
  template: `
    <div class="flex flex-col gap-4" data-testid="network-board">
      @if (_showSkeleton()) {
        @for (_ of _skeletons; track $index) {
          <div hlmSkeleton class="h-20 w-full" data-testid="line-skeleton"></div>
        }
      } @else if (_lines().length === 0) {
        <p
          class="text-muted-foreground border-border rounded-xl border border-dashed p-6 text-center text-sm"
          data-testid="line-board-empty"
        >
          No lines yet.
        </p>
      } @else {
        <div
          class="border-border flex flex-wrap items-center justify-between gap-2 border-b pb-2"
          data-testid="board-controls"
        >
          <div
            class="bg-muted/40 flex items-center gap-0.5 rounded-lg p-0.5"
            role="group"
            aria-label="Sort lines"
          >
            @for (option of _sortOptions; track option.value) {
              <button
                type="button"
                class="focus-visible:ring-ring/50 cursor-pointer rounded-md px-2 py-1 text-xs font-medium outline-none focus-visible:ring-2"
                [class.bg-background]="_sort() === option.value"
                [attr.aria-pressed]="_sort() === option.value"
                [attr.data-testid]="'board-sort-' + option.value"
                (click)="setSort(option.value)"
              >
                {{ option.label }}
              </button>
            }
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <div
              class="bg-muted/40 flex items-center gap-0.5 rounded-lg p-0.5"
              role="group"
              aria-label="Board view"
            >
              @for (option of _viewOptions; track option.value) {
                <button
                  type="button"
                  class="focus-visible:ring-ring/50 cursor-pointer rounded-md px-2 py-1 text-xs font-medium outline-none focus-visible:ring-2"
                  [class.bg-background]="_view() === option.value"
                  [attr.aria-pressed]="_view() === option.value"
                  [attr.data-testid]="'board-view-' + option.value"
                  (click)="setView(option.value)"
                >
                  {{ option.label }}
                </button>
              }
            </div>
          </div>
        </div>

        <!-- PRO ONLY. The heat grid is the one widget on this page that compares lines against each
             OTHER rather than describing one, and that is a question a rider does not have; it also
             takes a whole screen of the page's width, so a Rider view would be spending that on
             something they never look at. The gate is the SAME effective view the controls row
             writes, so a Pro reader arriving on ?view=pro sees the grid and a reader who never
             switched does not pay for it. It hides itself on a failed read (see
             NetworkHeatStripComponent) rather than tripping the page's retry banner. -->
        @if (_view() === "pro" && embedHeatStrip()) {
          <app-network-heat-strip />
        }

        <!-- The attention group renders only when it has lines, and is the FIRST section under the
             controls row: it needs no top divider because it already sits directly on the controls
             row's bottom border. A reader with nothing broken must not scroll past a
             "Needs attention · 0" heading to find out there is nothing. Every lower group is hidden
             when empty too, and draws its divider only when a section actually precedes it — so the
             first visible group never doubles the controls row's own border. -->
        @if (_attention().length > 0) {
          <section class="flex flex-col gap-2" data-testid="line-board-attention">
            <!-- The pulsing dot is the ONE piece of motion on the board, and it is motion-safe only:
               that variant does not match under prefers-reduced-motion: reduce, so a reader who
               asked for less motion gets the same heading with a static brand dot and loses nothing
               but the pulse. It reuses the existing animate-breathe theme token rather than adding a
               new one, and it is decorative — the count beside it is the actual information — so
               it is aria-hidden rather than announced as "live". -->
            <h2
              class="text-muted-foreground flex items-center gap-1.5 text-sm font-semibold tracking-wide uppercase"
              data-testid="line-board-attention-heading"
            >
              <span
                class="bg-brand motion-safe:animate-breathe inline-block size-1.5 shrink-0 rounded-full"
                data-testid="line-board-attention-dot"
                aria-hidden="true"
              ></span>
              Needs attention · {{ _attention().length }}
            </h2>
            <div class="flex flex-col gap-3">
              @for (line of _attention(); track line.id) {
                <div
                  class="scroll-mt-24 rounded-xl transition-shadow duration-1000 motion-reduce:transition-none"
                  [class.ring-2]="_isHighlighted(line.id)"
                  [class.ring-brand]="_isHighlighted(line.id)"
                  [class.ring-offset-2]="_isHighlighted(line.id)"
                  [class.ring-offset-background]="_isHighlighted(line.id)"
                  [attr.data-highlighted]="_isHighlighted(line.id) ? '' : null"
                  [attr.id]="'line-' + line.id"
                  data-testid="line-board-row"
                >
                  <app-line-pulse-card [line]="line" [refreshTick]="_refreshTick()" />
                </div>
              }
            </div>
          </section>
        }

        <!-- "My lines" renders only when the reader has pinned lines in this read. An empty pin list
             is a gap, not an invitation: an empty group's heading is noise on a board whose whole job
             is showing lines. Its divider appears only when the attention group precedes it, so as
             the first visible section it does not double the controls row's bottom border. -->
        @if (_mine().length > 0) {
          <section
            class="border-border flex flex-col gap-2"
            [class.border-t]="_attentionRendered()"
            [class.pt-4]="_attentionRendered()"
            data-testid="line-board-mine"
          >
            <h2
              class="text-muted-foreground text-sm font-semibold tracking-wide uppercase"
              data-testid="line-board-mine-heading"
            >
              My lines
            </h2>
            <div class="flex flex-col gap-2">
              @for (line of _mine(); track line.id) {
                <div
                  class="scroll-mt-24 rounded-xl transition-shadow duration-1000 motion-reduce:transition-none"
                  [class.ring-2]="_isHighlighted(line.id)"
                  [class.ring-brand]="_isHighlighted(line.id)"
                  [class.ring-offset-2]="_isHighlighted(line.id)"
                  [class.ring-offset-background]="_isHighlighted(line.id)"
                  [attr.data-highlighted]="_isHighlighted(line.id) ? '' : null"
                  [attr.id]="'line-' + line.id"
                  data-testid="line-board-row"
                >
                  <app-line-pulse-row
                    [line]="line"
                    [refreshTick]="_refreshTick()"
                    [viewMode]="_view()"
                  />
                </div>
              }
            </div>
          </section>
        }

        @if (_all().length > 0) {
          <section
            class="border-border flex flex-col gap-2"
            [class.border-t]="_attentionRendered() || _mineRendered()"
            [class.pt-4]="_attentionRendered() || _mineRendered()"
            data-testid="line-board-all"
          >
            <h2
              class="text-muted-foreground text-sm font-semibold tracking-wide uppercase"
              data-testid="line-board-all-heading"
            >
              All lines
            </h2>
            <div class="flex flex-col gap-2">
              @for (line of _all(); track line.id) {
                <div
                  class="scroll-mt-24 rounded-xl transition-shadow duration-1000 motion-reduce:transition-none"
                  [class.ring-2]="_isHighlighted(line.id)"
                  [class.ring-brand]="_isHighlighted(line.id)"
                  [class.ring-offset-2]="_isHighlighted(line.id)"
                  [class.ring-offset-background]="_isHighlighted(line.id)"
                  [attr.data-highlighted]="_isHighlighted(line.id) ? '' : null"
                  [attr.id]="'line-' + line.id"
                  data-testid="line-board-row"
                >
                  <app-line-pulse-row
                    [line]="line"
                    [refreshTick]="_refreshTick()"
                    [viewMode]="_view()"
                  />
                </div>
              }
            </div>
          </section>
        }

        <!-- Out-of-service lines (TESTING/DEFUNCT) — inventory, not service. They are excluded from
             Needs attention and from every hero number (see the lineNeedsAttention rule and
             summarizeNetwork), so the board still has to show them SOMEWHERE or a reader could
             never find a line that has not opened yet or has closed. Rendered LAST, hidden when
             empty, exactly like All lines. A pinned out-of-service line lives in My lines instead:
             for this bucket, "pin wins". -->
        @if (_others().length > 0) {
          <section
            class="border-border flex flex-col gap-2"
            [class.border-t]="_attentionRendered() || _mineRendered() || _allRendered()"
            [class.pt-4]="_attentionRendered() || _mineRendered() || _allRendered()"
            data-testid="line-board-others"
          >
            <h2
              class="text-muted-foreground text-sm font-semibold tracking-wide uppercase"
              data-testid="line-board-others-heading"
            >
              Others
            </h2>
            <div class="flex flex-col gap-2">
              @for (line of _others(); track line.id) {
                <div
                  class="scroll-mt-24 rounded-xl transition-shadow duration-1000 motion-reduce:transition-none"
                  [class.ring-2]="_isHighlighted(line.id)"
                  [class.ring-brand]="_isHighlighted(line.id)"
                  [class.ring-offset-2]="_isHighlighted(line.id)"
                  [class.ring-offset-background]="_isHighlighted(line.id)"
                  [attr.data-highlighted]="_isHighlighted(line.id) ? '' : null"
                  [attr.id]="'line-' + line.id"
                  data-testid="line-board-row"
                >
                  <app-line-pulse-row
                    [line]="line"
                    [refreshTick]="_refreshTick()"
                    [viewMode]="_view()"
                  />
                </div>
              }
            </div>
          </section>
        }
      }
    </div>
  `,
})
export class NetworkBoardComponent {
  /**
   * Whether THIS board draws the Pro heat grid itself.
   *
   * 🔴 **The one input this component has, and it exists for exactly one caller.** On the plain board
   * the grid belongs inside the panel — a Pro reader who toggled the view on the Rider page expects to
   * find it there. The Pro dashboard is a BENTO LAYOUT with a dedicated heat-grid cell, and rendering
   * `app-network-heat-strip` twice would put the same `network-heat-strip` testid on the page and draw
   * the same grid twice. So the dashboard turns this off and places the component itself, next to the
   * other cells it is comparing.
   *
   * Default `true`, deliberately: the Rider board's behaviour must not change to accommodate a new
   * layout, and a host that forgets the input must get the full board rather than a silently narrower
   * one. It gates ONE sibling `@if` and nothing else — the groups, the controls, the sort and the
   * anchors are all unaffected.
   */
  readonly embedHeatStrip = input(true);

  private readonly store = inject(HomeStore);
  private readonly viewMode = inject(HomeViewModeService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly isBrowser = injectIsBrowser();

  /**
   * The query params as a signal. Seeded from `route.snapshot.queryParamMap` so the FIRST read —
   * the one the server render itself performs — has the server's URL, and not an empty map that the
   * first observable emission would then contradict. Without that seed a deep link would render the
   * default on the server and the linked value on the client.
   */
  private readonly queryParamMap = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  protected readonly _skeletons = Array.from({ length: SKELETON_ROWS });

  protected readonly _sortOptions: ReadonlyArray<{ value: BoardSort; label: string }> = [
    { value: "severity", label: "Severity" },
    { value: "name", label: "Name" },
  ];
  protected readonly _viewOptions: ReadonlyArray<{ value: PreferencesViewMode; label: string }> = [
    { value: "rider", label: "Rider" },
    { value: "pro", label: "Pro" },
  ];

  protected readonly _lines = this.store.visibleLines;
  protected readonly _attention = this.store.attentionLines;
  protected readonly _mine = this.store.myLines;
  protected readonly _all = this.store.allLines;
  protected readonly _others = this.store.othersLines;
  protected readonly _refreshTick = this.store.linesRefreshTick;

  /**
   * Which groups actually render — the SAME predicates their `@if`s use, exposed as signals so the
   * divider bindings can ask "is a section above me on the page?".
   *
   * The divider is per-section rather than a container `divide-y` because the sections appear and
   * disappear independently: each group carries its own, gated on the groups that precede it, so the
   * first visible group leaves the controls row's bottom border as the only line.
   */
  protected readonly _attentionRendered = computed(() => this._attention().length > 0);
  protected readonly _mineRendered = computed(() => this._mine().length > 0);
  protected readonly _allRendered = computed(() => this._all().length > 0);

  /**
   * Skeletons only while the FIRST read is in flight and there is nothing to show — the same shape
   * the feed column uses. A later reload never blanks the board: dropping sixteen rows for a
   * fraction of a second every 30 seconds would be worse than stale data.
   */
  protected readonly _showSkeleton = computed(
    () => this.store.isLoading() && this._lines().length === 0,
  );

  /**
   * The sort in force: the URL's when it carries one, else the store's. `readTextQueryParam` is
   * what distinguishes "absent" from "present but unrecognised" — the latter must degrade to the
   * shared default rather than to whatever the store happened to hold, so a copied link with a typo
   * in it still renders a defined board.
   */
  protected readonly _sort = computed<BoardSort>(() => {
    const params = this.queryParamMap();
    if (readTextQueryParam(params, SORT_PARAM) === null) {
      return this.store.boardSort();
    }
    return readEnumQueryParam(params, SORT_PARAM, BOARD_SORTS, DEFAULT_BOARD_SORT);
  });

  /** The view in force — owned by {@link HomeViewModeService}, not re-derived here. */
  protected readonly _view = this.viewMode.view;

  /**
   * The line the store is currently ringing, and the one predicate every row wrapper asks.
   *
   * A METHOD rather than an inline `_highlightedLineId() === line.id` in three templates, because
   * these three wrappers have to agree exactly — a ring that lands on the card in one group and the
   * row in another would report the same event two different ways. `data-highlighted` is on the same
   * element as the ring classes so a spec can assert the highlight through the DOM as well as
   * through the signal.
   */
  protected readonly _highlightedLineId = this.store.highlightedLineId;

  protected _isHighlighted(lineId: string): boolean {
    return this._highlightedLineId() === lineId;
  }

  constructor() {
    // Write half: mirror the effective SORT into the URL. `writeQueryParams` is browser-gated (a
    // reactive navigate() during SSR hangs the render), and the equality guard below stops the
    // redundant navigation a back/forward would otherwise trigger by re-navigating onto the exact
    // parameter it just left. `?view=` is deliberately absent from this patch: it is
    // `HomeViewModeService`'s param now, and `queryParamsHandling: "merge"` means each half can
    // own its own key without either one clobbering the other.
    effect(() => {
      const sortTarget = queryParamForWrite(this._sort(), DEFAULT_BOARD_SORT);
      if (sortTarget === readTextQueryParam(this.queryParamMap(), SORT_PARAM)) {
        return;
      }
      writeQueryParams(this.router, this.route, { [SORT_PARAM]: sortTarget }, this.isBrowser);
    });

    // URL -> durable state. A deep link (or a back/forward) has to land somewhere the next render
    // without the URL, or the board would forget the choice the moment the reader copied the link.
    // `signal.set` with an equal value does not notify, so this never fights a toggle that already
    // wrote both halves.
    effect(() => {
      const sort = this._sort();
      if (sort !== this.store.boardSort()) {
        this.store.setBoardSort(sort);
      }
    });

    // Post-submit "you just reported about this line": scroll its `#line-<id>` anchor into view.
    // The store owns WHEN (the page calls `highlightLine()`, and its timer clears it) and this
    // component owns WHERE — it is the only thing that renders those anchors, so no page-level DOM
    // query is needed to find one.
    //
    // 🔴 Browser-gated, like every other navigation in this component: `scrollIntoView` does not
    // exist during SSR, and reading the anchor off the server's document would scroll nothing.
    // `block: "center"` rather than "start" because the target is a ROW in a list, not a section —
    // and `prefers-reduced-motion` drops `smooth` rather than fighting it.
    effect(() => {
      const lineId = this._highlightedLineId();
      if (!lineId || !this.isBrowser) {
        return;
      }
      const anchor = document.getElementById(`line-${lineId}`);
      if (!anchor || typeof anchor.scrollIntoView !== "function") {
        return;
      }
      const reduced =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      anchor.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    });
  }

  /** Sort toggle: the store AND the URL, so the order survives a reload and is shareable. */
  protected setSort(sort: BoardSort): void {
    this.store.setBoardSort(sort);
  }

  /** View toggle: one writer — the service persists the choice AND mirrors it into the URL. */
  protected setView(view: PreferencesViewMode): void {
    this.viewMode.setView(view);
  }
}
