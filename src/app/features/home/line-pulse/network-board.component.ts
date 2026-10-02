import { isPlatformBrowser } from "@angular/common";
import { Component, PLATFORM_ID, computed, effect, inject } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router } from "@angular/router";

import {
  PreferencesDensity,
  PreferencesService,
  PreferencesViewMode,
} from "../../../core/preferences/preferences.service";
import {
  queryParamForWrite,
  readEnumQueryParam,
  readTextQueryParam,
  writeQueryParams,
} from "../../../core/url-state/query-param.util";
import { BOARD_SORTS, BoardSort, DEFAULT_BOARD_SORT, HomeStore } from "../data/home.store";
import { HlmSkeleton } from "../../../ui/skeleton/skeleton";
import { LinePulseCardComponent } from "./line-pulse-card.component";
import { LinePulseRowComponent } from "./line-pulse-row.component";

/** Matches the typical above-the-fold line count, so the first paint doesn't jump. */
const SKELETON_ROWS = 3;

const BOARD_VIEWS: readonly PreferencesViewMode[] = ["rider", "pro"];
const DEFAULT_BOARD_VIEW: PreferencesViewMode = "rider";
const BOARD_DENSITIES: readonly PreferencesDensity[] = ["comfortable", "compact"];

/** The URL param names. Named once so the read and write halves cannot drift. */
const SORT_PARAM = "sort";
const VIEW_PARAM = "view";

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
 * store (and the URL), the view and density in `PreferencesService` — because this component
 * composes, it does not decide.
 *
 * **URL state.** `?sort=` and `?view=` are read from `route.queryParamMap` (seeded from the route
 * SNAPSHOT, so the server render and the client hydration read the same value) and mirrored back
 * through the shared `writeQueryParams`, which is browser-gated because a reactive `router.navigate()`
 * during SSR hangs the render. Three rules, all inherited from the helpers rather than re-derived:
 *
 *  - **A default never appears in the URL.** `sort=severity` and `view=rider` are written as `null`,
 *    so "no query params" and "the default view" are one state and a plain page load carries no
 *    parameters it did not choose.
 *  - **The URL wins over the stored preference.** `effectiveView` is "the URL's value when there is
 *    one, else `PreferencesService.viewMode`", which is what makes `?view=pro` a shareable link
 *    while a returning Pro reader still gets Pro without one. A param that is present but
 *    unrecognisable degrades to the DEFAULT rather than to the stored preference, matching how the
 *    rest of the app treats a bad query value.
 *  - **Density is preference-only.** It is a per-device reading habit, not something a shared link
 *    should impose, so it never reaches the URL.
 *
 * The write half runs in an `effect` (so a deep link, a browser back/forward and a toggle all land
 * in the same place) and is guarded against redundant navigation: if the URL already says what the
 * effective state says, it writes nothing. Without that guard, back/forward through `?sort=name`
 * would immediately re-navigate onto the parameters it came from.
 *
 * **Anchors and the post-submit highlight.** Every row wrapper — in ALL THREE groups, because a
 * report can be about any line — carries a stable `id="line-<id>"` and is the thing
 * `HomeStore.highlightLine()` rings. The id is what makes "return the reader to the line they just
 * reported about" a one-line scroll (see the effect in the constructor), and the ring is a CSS
 * class rather than an animation so it degrades honestly: `motion-reduce:transition-none` leaves the
 * ring VISIBLE with no transition under `prefers-reduced-motion`, which is what a reader who asked
 * for less motion still needs — the information, not the flourish.
 */
@Component({
  selector: "app-network-board",
  imports: [HlmSkeleton, LinePulseCardComponent, LinePulseRowComponent],
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
                class="cursor-pointer rounded-md px-2 py-1 text-xs font-medium"
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
                  class="cursor-pointer rounded-md px-2 py-1 text-xs font-medium"
                  [class.bg-background]="_view() === option.value"
                  [attr.aria-pressed]="_view() === option.value"
                  [attr.data-testid]="'board-view-' + option.value"
                  (click)="setView(option.value)"
                >
                  {{ option.label }}
                </button>
              }
            </div>

            <!-- Pro-only: a rider has no use for a density control, so it does not exist for them
                 rather than sitting disabled. -->
            @if (_view() === "pro") {
              <div
                class="bg-muted/40 flex items-center gap-0.5 rounded-lg p-0.5"
                role="group"
                aria-label="Row density"
              >
                @for (option of _densityOptions; track option.value) {
                  <button
                    type="button"
                    class="cursor-pointer rounded-md px-2 py-1 text-xs font-medium"
                    [class.bg-background]="_density() === option.value"
                    [attr.aria-pressed]="_density() === option.value"
                    [attr.data-testid]="'board-density-' + option.value"
                    (click)="setDensity(option.value)"
                  >
                    {{ option.label }}
                  </button>
                }
              </div>
            }
          </div>
        </div>

        <!-- The attention group is the only one that HIDES when empty: a reader with nothing broken
             must not scroll past a "Needs attention · 0" heading to find out there is nothing. -->
        @if (_attention().length > 0) {
          <section class="flex flex-col gap-2" data-testid="line-board-attention">
            <h2
              class="text-muted-foreground text-sm font-semibold tracking-wide uppercase"
              data-testid="line-board-attention-heading"
            >
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

        <!-- "My lines" always draws, because an empty pin list is an INVITATION to pin rather than a
             gap in the page. The hint is the whole content of that state. -->
        <section class="flex flex-col gap-2" data-testid="line-board-mine">
          <h2
            class="text-muted-foreground text-sm font-semibold tracking-wide uppercase"
            data-testid="line-board-mine-heading"
          >
            My lines
          </h2>
          @if (_mine().length > 0) {
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
                    [density]="_density()"
                    [viewMode]="_view()"
                  />
                </div>
              }
            </div>
          } @else {
            <p class="text-muted-foreground text-sm" data-testid="line-board-mine-empty">
              Pin a line to keep it here.
            </p>
          }
        </section>

        @if (_all().length > 0) {
          <section class="flex flex-col gap-2" data-testid="line-board-all">
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
                    [density]="_density()"
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
  private readonly store = inject(HomeStore);
  private readonly preferences = inject(PreferencesService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

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
  protected readonly _densityOptions: ReadonlyArray<{
    value: PreferencesDensity;
    label: string;
  }> = [
    { value: "comfortable", label: "Comfortable" },
    { value: "compact", label: "Compact" },
  ];

  protected readonly _lines = this.store.lines;
  protected readonly _attention = this.store.attentionLines;
  protected readonly _mine = this.store.myLines;
  protected readonly _all = this.store.allLines;
  protected readonly _refreshTick = this.store.linesRefreshTick;

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

  /** The view in force: `?view=` when present, else the reader's stored preference. */
  protected readonly _view = computed<PreferencesViewMode>(() => {
    const params = this.queryParamMap();
    if (readTextQueryParam(params, VIEW_PARAM) === null) {
      return this.preferences.viewMode();
    }
    return readEnumQueryParam(params, VIEW_PARAM, BOARD_VIEWS, DEFAULT_BOARD_VIEW);
  });

  /** Density is preference-only — see the class doc on why it never reaches the URL. */
  protected readonly _density = computed(() => this.preferences.density());

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
    // Write half: mirror the effective state into the URL. `writeQueryParams` is browser-gated (a
    // reactive navigate() during SSR hangs the render), and the equality guard below stops the
    // redundant navigation a back/forward would otherwise trigger by re-navigating onto the exact
    // parameters it just left.
    effect(() => {
      const sortTarget = queryParamForWrite(this._sort(), DEFAULT_BOARD_SORT);
      const viewTarget = queryParamForWrite(this._view(), DEFAULT_BOARD_VIEW);
      const params = this.queryParamMap();
      if (
        sortTarget === readTextQueryParam(params, SORT_PARAM) &&
        viewTarget === readTextQueryParam(params, VIEW_PARAM)
      ) {
        return;
      }
      writeQueryParams(
        this.router,
        this.route,
        { [SORT_PARAM]: sortTarget, [VIEW_PARAM]: viewTarget },
        this.isBrowser,
      );
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
    effect(() => {
      const view = this._view();
      if (view !== this.preferences.viewMode()) {
        this.preferences.setViewMode(view);
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

  /** View toggle: the preference AND the URL, so a Pro board is a link somebody else can open. */
  protected setView(view: PreferencesViewMode): void {
    this.preferences.setViewMode(view);
  }

  /** Density toggle: preference only. */
  protected setDensity(density: PreferencesDensity): void {
    this.preferences.setDensity(density);
  }
}
