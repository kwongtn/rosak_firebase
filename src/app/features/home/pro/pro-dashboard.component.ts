import { isPlatformBrowser } from "@angular/common";
import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  viewChild,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router } from "@angular/router";

import { HlmButton } from "../../../ui/button/button";
import {
  queryParamForWrite,
  readTextQueryParam,
  writeQueryParams,
} from "../../../core/url-state/query-param.util";
import { HomeStore } from "../data/home.store";
import { HomeViewModeService } from "../data/home-view-mode.service";
import { ProFeedWidgetComponent } from "./pro-feed-widget.component";
import { ProIncidentsWidgetComponent } from "./pro-incidents-widget.component";
import { ProLineHqWidgetComponent } from "./pro-line-hq-widget.component";
import { ProLinesWidgetComponent } from "./pro-lines-widget.component";
import { ProOfficialWidgetComponent } from "./pro-official-widget";
import { ProReportRankingComponent } from "./pro-report-ranking.component";
import { NetworkHeatStripComponent } from "./network-heat-strip.component";

/** The URL params this widget owns. Named once so the read and write halves cannot drift. */
const LINE_PARAM = "line";
const QUERY_PARAM = "q";

/** Element types that own their own keyboard. Checked against the event target before a shortcut runs. */
const TYPING_TAGS: ReadonlySet<string> = new Set(["INPUT", "TEXTAREA", "SELECT", "OPTION"]);

/** 🔴 Which event target a shortcut must refuse to steal from.
 *
 *  A `<div contenteditable>` is in here for the same reason the tags are: it accepts text, and a
 *  shortcut that fired there would replace the reader's own typing with a page action. The attribute
 *  check is on the element ITSELF rather than an `isContentEditable` walk, because jsdom does not
 *  implement the property and a spec would then assert nothing. */
function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element || typeof element.tagName !== "string") {
    return false;
  }
  return TYPING_TAGS.has(element.tagName) || element.getAttribute?.("contenteditable") != null;
}

/**
 * The **Pro bento dashboard** — the second layout `home.page` can render.
 *
 * 🔴 **It is a LAYOUT, not a second home page.** It reuses the board, the heat grid, the shared link
 * thread, the shared vote and edit wiring and the store's single reads; what it adds is a grid that
 * puts those surfaces side by side, three Pro-only filters, a CSV export, three keyboard shortcuts and
 * a hint row that says they exist. The hero, the submit box's shared sheet, the report chooser, the
 * status sheet and the spotting sheet all stay OUTSIDE this branch in `HomePage`, so a Pro reader and
 * a rider submit a link, file a status report or log a sighting through exactly the same code — a
 * second submission path is the one thing a "mode" must never grow.
 *
 * **The seven cells, and why each is where it is.** The board is the largest and takes the left column
 * because it is what a Pro reader opened this for; the feed sits beside it because "what are people
 * saying" is the other half of the question. The heat grid, the Line HQ grid, the incidents list, the
 * worst-lines ranking and the official-notices archive are supporting surfaces, so they take the
 * narrow right column, stacked. Each widget owns its own loading and failure state, and none of them
 * can take the page down (see the incidents widget's doc for the store's rule).
 *
 * **Keyboard shortcuts, and the rules around them.** `/` focuses the feed search, `r` is the same
 * refresh the refresh control and the mobile bar call (`store.polling.refreshNow()`, never a second
 * code path into `reloadFirstPages()`), and `p` goes back to the Rider view through the view service —
 * the one writer of `?view=`, so the shortcut cannot leave the preference and the URL disagreeing.
 *
 *  - 🔴 **Every shortcut is refused while the reader is typing.** `/` is a character, `r` is a letter
 *    and `p` is a letter: without this guard, a reader who starts typing "Kelana Jaya line" into the
 *    search box would fire a refresh and then throw away the page. The check covers inputs,
 *    textareas, selects and anything `contenteditable`.
 *  - 🔴 **A modified keystroke is never a shortcut.** Ctrl/Cmd/Alt + `r` is reload and
 *    Ctrl/Cmd/Alt + `p` is print; hijacking either would break a browser affordance the reader can see.
 *  - The listener is on `document` rather than on the dashboard's own host element, because a reader
 *    who has not clicked anything has focus on `document.body` and a host-level listener would never
 *    fire. It is registered for as long as this component exists, which is what confines the
 *    shortcuts to the Pro view: on the Rider page this component is not mounted and there is no
 *    listener at all, so `r` and `p` are ordinary typing.
 *
 * **URL state.** `?line=` mirrors the feed's line filter and `?q=` the search, through the shared
 * browser-gated `writeQueryParams` with the same redundant-navigate guard `?view=` and `?sort=` use.
 * Both are read from the route SNAPSHOT on the way in, so a shared `?view=pro&line=3&q=kelana` link
 * renders identically on the server and on the client. 🔴 While the effective view is `rider` these two
 * params are INERT — this component is not mounted, so nothing reads them and nothing applies them;
 * leaving Pro clears both from the store and from the URL, which is what stops a Pro reader's narrowing
 * from silently following them into the rider board (see `ngOnDestroy`).
 */
@Component({
  selector: "app-pro-dashboard",
  imports: [
    HlmButton,
    NetworkHeatStripComponent,
    ProFeedWidgetComponent,
    ProIncidentsWidgetComponent,
    ProLineHqWidgetComponent,
    ProLinesWidgetComponent,
    ProOfficialWidgetComponent,
    ProReportRankingComponent,
  ],
  template: `
    <div class="flex flex-col gap-4" data-testid="pro-dashboard">
      <!-- The hint row. Visible rather than a hidden affordance: a shortcut nobody can discover is a
           shortcut nobody uses, and the three keys are not guessable. The kbd element marks them as keys rather
           than as emphasis. Back to Rider is a real button too — the shortcuts are an accelerator, not
           the only way out of a mode. -->
      <div
        class="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
        data-testid="pro-shortcuts"
      >
        <span class="flex items-center gap-1.5">
          <kbd
            class="border-border rounded border px-1 py-0.5 font-mono"
            data-testid="pro-shortcut-search"
            >/</kbd
          >
          <span>Search links</span>
        </span>
        <span class="flex items-center gap-1.5">
          <kbd
            class="border-border rounded border px-1 py-0.5 font-mono"
            data-testid="pro-shortcut-refresh"
            >r</kbd
          >
          <span>Refresh now</span>
        </span>
        <span class="flex items-center gap-1.5">
          <kbd
            class="border-border rounded border px-1 py-0.5 font-mono"
            data-testid="pro-shortcut-rider"
            >p</kbd
          >
          <span>Back to rider view</span>
        </span>
        <button
          hlmBtn
          variant="ghost"
          size="sm"
          class="focus-visible:ring-ring/50 ml-auto rounded outline-none focus-visible:ring-2"
          data-testid="pro-back-to-rider"
          (click)="backToRider()"
        >
          Back to rider view
        </button>
      </div>

      <!-- The bento grid: one wide left column for the board, a narrower right column for the three
           supporting surfaces. Stacked on mobile, side by side from the xl breakpoint — a bento at lg would put
           two dense grids into two narrow columns and read worse than the stack. -->
      <div
        class="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
        data-testid="pro-bento"
      >
        <div class="flex min-w-0 flex-col gap-4">
          <app-pro-lines-widget />
          <app-pro-feed-widget />
        </div>
        <div class="flex min-w-0 flex-col gap-4">
          <!-- Its own cell rather than inside the board: The embedHeatStrip input is off on the board below,
               so the grid is drawn exactly once. Two copies would mean two network-heat-strip
               testids and the same comparison rendered twice. -->
          <section
            class="border-border bg-card flex flex-col gap-2 rounded-xl border p-4"
            data-testid="pro-heat-widget"
          >
            <app-network-heat-strip />
          </section>

          <app-pro-incidents-widget />
          <app-pro-line-hq-widget />

          <!-- 🔴 The two supporting widgets added last, and why they sit BELOW the Line HQ grid in the
               right column rather than beside the board. Both are reference panels, not lists a
               reader works through: the official archive answers "what did the operator last say" and
               the ranking answers "which lines are loudest today", so a reader scrolls to them the way
               they scroll to a footnote. Each owns its own read and its own failure state — the
               archive is a lazy read of its own, and the ranking is a third view of the heat grid's
               buckets — so neither can take the page down or hold the refresh control open. -->
          <app-pro-report-ranking />
          <app-pro-official-widget />
        </div>
      </div>
    </div>
  `,
})
export class ProDashboardComponent implements OnDestroy {
  private readonly store = inject(HomeStore);
  private readonly viewMode = inject(HomeViewModeService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly feedWidget = viewChild.required(ProFeedWidgetComponent);

  /** The query params, seeded from the SNAPSHOT so a deep link renders the same on server and client. */
  private readonly queryParamMap = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  /** The route's own key, read once so a param this widget does not own is never mistaken for its own. */
  private readonly _lineParam = computed(() =>
    readTextQueryParam(this.queryParamMap(), LINE_PARAM),
  );
  private readonly _queryParam = computed(() =>
    readTextQueryParam(this.queryParamMap(), QUERY_PARAM),
  );

  constructor() {
    // URL -> store, ONCE per entry into Pro rather than as an effect. An effect would keep pushing the
    // URL's value back over a reader who has since typed something else, so `?q=` would win every
    // keystroke the moment the router re-emitted an unrelated param.
    if (this._lineParam() !== null || this._queryParam() !== null) {
      this.store.setLineFilter(this._lineParam());
      this.store.setFeedSearchQuery(this._queryParam());
    }

    // store -> URL: one browser-gated effect mirroring both, each guarded on "the URL already says
    // this" so a back/forward cannot bounce. Defaults are written as `null`, so "no filter" and "no
    // param" are one state and `?view=pro` alone is a clean shareable link.
    effect(() => {
      const line = queryParamForWrite(this.store.lineFilter() ?? "", "");
      const query = queryParamForWrite(this.store.feedSearchQuery().trim(), "");
      if (line === this._lineParam() && query === this._queryParam()) {
        return;
      }
      writeQueryParams(
        this.router,
        this.route,
        { [LINE_PARAM]: line, [QUERY_PARAM]: query },
        this.isBrowser,
      );
    });
  }

  /**
   * 🔴 **`/`, `r`, `p` — refused while the reader is typing or holding a modifier.**
   *
   * `document`-level on purpose: a reader who has not clicked anything has focus on `document.body`,
   * so a host-element listener would never fire and the shortcuts would appear broken. The listener
   * exists only while this component does, which is what confines the whole feature to the Pro view.
   *
   * The typing guard is not optional. `r` and `p` are ordinary letters: a reader typing "Kelana Jaya"
   * into the feed search would otherwise refresh the page on the `r` in "Kelana" and lose the rest.
   */
  @HostListener("document:keydown", ["$event"])
  protected onKeyDown(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === "/") {
      event.preventDefault();
      this.feedWidget().focusSearch();
      return;
    }
    if (key === "r") {
      event.preventDefault();
      this.refreshNow();
      return;
    }
    if (key === "p") {
      event.preventDefault();
      this.backToRider();
    }
  }

  /** `r` — the SAME beat the refresh control's click and the mobile bar's button drive. */
  protected refreshNow(): void {
    this.store.polling.refreshNow();
  }

  /** `p`, and the hint row's button. Through the view service, so the preference AND `?view=` are
   *  written by the one owner of that fact. */
  protected backToRider(): void {
    this.viewMode.setView("rider");
  }

  /**
   * 🔴 **Leaving Pro clears every filter this view owns — in the store AND in the URL.**
   *
   * `HomeStore` is ROUTE-SCOPED and its injector OUTLIVES a visit, so a filter that is not cleared here
   * is still set when the Rider board mounts a moment later: the rider would come to a board missing
   * eleven lines, and a feed narrowed to one line, with no control on the page to explain either. The
   * store call is therefore not optional housekeeping.
   *
   * The URL clear is the other half of the same promise. Without it the address bar would keep
   * `?line=3&q=kelana` while the rider feed showed the whole network, so re-entering Pro would
   * re-apply a filter the reader had visibly walked away from. It is browser-gated inside
   * `writeQueryParams`, so a server render never asks the router for anything.
   */
  ngOnDestroy(): void {
    this.store.resetProFilters();
    if (this._lineParam() !== null || this._queryParam() !== null) {
      writeQueryParams(
        this.router,
        this.route,
        { [LINE_PARAM]: null, [QUERY_PARAM]: null },
        this.isBrowser,
      );
    }
  }
}
