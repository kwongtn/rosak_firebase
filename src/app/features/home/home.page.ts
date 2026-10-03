import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
  type OnDestroy,
} from "@angular/core";
import { Meta } from "@angular/platform-browser";
import { RouterLink } from "@angular/router";
import { NgIcon, provideIcons } from "@ng-icons/core";
import { lucideMapPin, lucideRefreshCw } from "@ng-icons/lucide";

import { AppFooterComponent } from "../../shell/app-footer/app-footer.component";
import { AppNavComponent } from "../../shell/app-nav/app-nav.component";
import { AuthService } from "../../core/auth/auth.service";
import {
  RetryBannerComponent,
  type RetryableResource,
} from "../../ui/retry-banner/retry-banner.component";
import { HlmButton } from "../../ui/button/button";
import { HlmSheet, HlmSheetBody, HlmSheetFooter, HlmSheetHeader } from "../../ui/sheet/sheet";
import { HlmSkeleton } from "../../ui/skeleton/skeleton";
import { ReportSheetService } from "../spotting/data/report-sheet.service";
import { ReportFormComponent } from "../spotting/report-form/report-form.component";
import { canEditLink } from "../insiden/data/can-edit.link.util";
import { LinkCardItem } from "../insiden/data/link-card-item";
import { LinkSheetService } from "../insiden/data/link-sheet.service";
import { LinkThreadComponent } from "../insiden/link-thread/link-thread.component";
import { LinkSheetComponent } from "../insiden/link-sheet/link-sheet.component";
import { LinePulse } from "./data/home.queries";
import { HomeStore } from "./data/home.store";
import { LineStatusSheetService } from "./data/line-status-sheet.service";
import { LinkSubmitBoxComponent } from "./feed/link-submit-box.component";
import { HomeHeroComponent } from "./hero/home-hero.component";
import { NetworkBoardComponent } from "./line-pulse/network-board.component";
import { LineStatusSheetComponent } from "./line-status/line-status-sheet.component";
import { ReportChooserComponent } from "./report/report-chooser.component";
import { ReportChooserService } from "./report/report-chooser.service";
import { HomeViewModeService } from "./data/home-view-mode.service";
import { ProDashboardComponent } from "./pro/pro-dashboard.component";

/**
 * One paragraph for crawlers and link previews. It names the mechanism and never a number — every
 * figure on this page is derived from the line read, and each rule behind one is defined in the
 * methodology registry (`core/methodology/`), which the hero's own info popover links to.
 */
const META_DESCRIPTION =
  "MLPTF's live network board: how every rail line is doing right now, today's community links and " +
  "reports, and one tap to report a delay, log a train sighting or open the live train map.";

/** The two feed periods, IN TABLIST ORDER — the array the arrow keys walk, so the order the reader
 *  sees and the order the keyboard walks cannot drift apart. */
const FEED_TABS = ["today", "lastweek"] as const;

type FeedTab = (typeof FEED_TABS)[number];

/**
 * The community front page — the site's root route. The network board and the community feed share a
 * two-panel split, and the **board comes first in DOM order** (the line board left, the URL list
 * right) from `lg` up and above the feed when the two stack on mobile — the live network is the
 * reason to open this page, so it is what a phone reader meets first. Inside the feed column the
 * submit box heads a **Today / Last Week tab set**, each panel a `role="tabpanel"`. The retry banner
 * and footer stay full width. The refresh control (`app-home-refresh-control`) now lives in the HERO
 * only (from `lg` up); below that the sticky mobile action bar carries a Refresh button on the same
 * store beat plus Report and Live map, which is what keeps every intent reachable on a phone.
 *
 * Route-scoped: HomeStore and LineStatusSheetService are provided by the `""` route in
 * app.routes.ts. The router retains that route injector while the page component is recreated on
 * every visit, so the STORE outlives a visit: the constructor calls `start()` (resuming a paused
 * beat and revalidating on re-entry) and `ngOnDestroy` calls `stop()` (the beat must not keep
 * polling while the reader is elsewhere). Data fetching, loading/empty states, the vote overlay,
 * the board's line partition and the refresh countdown's confirmation all live in the store and the
 * control; this page only composes.
 *
 * Every feed row renders through `app-link-thread` — the collapsible conversation wrapper — not
 * `app-link-card` directly, in BOTH the today feed and the Last Week day groups (the two
 * surfaces the plan ships conversation UI on). The wrapper renders the root as an ordinary card, so
 * an ungrouped link looks exactly as it did; it only adds a "N links" + chevron affordance when the
 * backend reports a non-zero `sublinkCount` on the root, with the children waiting inline under
 * `sublinks`. `HomeStore` asks the backend to collapse conversations for that to be possible at all
 * (see `HOME_FEED_COLLAPSE_VARS`).
 *
 * `app-network-board` takes no inputs: it reads `HomeStore` for the lines, the poll tick and its own
 * three-group partition, the same way `app-home-refresh-control` reads the store's beat. That is
 * deliberate — the partition RULE belongs to the store, and passing the groups in as inputs would
 * mean re-deriving them here for no gain.
 */
@Component({
  selector: "app-home-page",
  imports: [
    AppNavComponent,
    AppFooterComponent,
    HomeHeroComponent,
    LinkSubmitBoxComponent,
    LinkThreadComponent,
    LinkSheetComponent,
    NetworkBoardComponent,
    LineStatusSheetComponent,
    ReportChooserComponent,
    ReportFormComponent,
    ProDashboardComponent,
    RetryBannerComponent,
    HlmButton,
    HlmSheet,
    HlmSheetHeader,
    HlmSheetBody,
    HlmSheetFooter,
    HlmSkeleton,
    RouterLink,
    NgIcon,
  ],
  providers: [provideIcons({ lucideRefreshCw, lucideMapPin })],
  template: `
    <app-nav />

    <main
      class="mx-auto flex min-h-screen w-full flex-col gap-6 p-4 pb-24 sm:p-6 lg:w-[90%] lg:pb-6"
    >
      @if (store.hasError()) {
        <app-retry-banner [resource]="errorResource" message="Couldn't load the front page." />
      }

      <!-- Full width above the two-column split, not inside it: the headline and the tiles describe
           the WHOLE page (both columns), so giving them one column would make half the summary lie.
           It reads the same two signals the page already had (the lines resource and the feed's own
           totalCount), so it adds no request, and its report CTA opens the chooser hosted below. -->
      <app-home-hero [lines]="store.lines()" [linksToday]="store.feedTotalCount()" />

      <!-- The one place the page branches on the view, and it branches on ONE signal:
           HomeViewModeService's view() — the URL's ?view= when present, else the reader's stored
           preference. One answer, read by one owner, is what stops the two layouts disagreeing with
           the toggle that chose between them.

           r: the rider two-panel split. p: the Pro bento grid, which reuses this page's board, heat
           grid, shared link thread and store rather than reimplementing any of them.

           The hero, the retry banner and every sheet are ABOVE and BELOW this branch on purpose: a
           report, a link submission and a spotting entry must go through the same code in both views,
           and a "mode" that quietly grew its own submission path is the thing this refactor exists to
           prevent. The mobile action bar below is shared chrome for the same reason. -->
      @if (viewMode.view() === "pro") {
        <app-pro-dashboard />
      } @else {
        <div
          class="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start"
          data-testid="home-panels"
        >
          <!-- 🔴 BOARD FIRST, AND FIRST IN THE DOM — not a CSS order value. The board is the page's
               reason to exist (the hero's headline above is about the NETWORK), so it has to be the
               first thing a phone reader meets and the left column from lg up. An order value would
               have put it first on desktop while leaving it LAST in the stacked mobile layout, and
               every screen reader and every Tab key would still have walked the feed first.

               Below lg this panel heads the stack, so it needs no rule of its own; the FEED section
               below it draws the divider between the two and drops it from lg, where the two are
               grid columns side by side and a border would only draw a line down the middle of the
               gap. -->
          <section
            #lineBoard
            class="flex scroll-mt-24 flex-col gap-3"
            aria-label="Line status"
            data-testid="line-board"
          >
            <!-- 🔴 The refresh control that used to head this section from lg up has moved INTO the
                 hero, which is full width and reads as the page's live strip — so the live indicator
                 now sits above the fold on every layout instead of only on desktop. The sticky
                 action bar at the foot of the page carries the phone's Refresh on the SAME
                 store.polling beat, which keeps exactly one countdown at any width and keeps both
                 affordances on the one beat. The control's own state machine is untouched: only the
                 wrapper moved. -->
            <app-network-board />
          </section>

          <section
            class="border-border flex flex-col gap-3 border-t pt-6 lg:border-t-0 lg:pt-0"
            aria-label="Community feed"
          >
            <!-- 🔴 The mobile app-home-refresh-control copy that used to sit here is GONE. The
                 sticky action bar at the foot of the page carries a Refresh button on the same
                 store.polling beat at exactly the widths this gate (lg:hidden) covered, so two
                 controls on one phone was one too many — and the bar is the only place a rider can
                 reach Report from while scrolled to the bottom of the feed. One beat, one countdown
                 instance in the hero, one Refresh affordance on a phone. -->
            <app-link-submit-box (submitted)="store.reloadAll()" />

            <!-- 🔴 A REAL TAB SET, replacing the collapsed Last Week disclosure button. The two
                 periods are peers a reader switches between, not a section that expands in place, so
                 they are role=tab / role=tabpanel with aria-selected, aria-controls and
                 aria-labelledby, and the roving tabindex: exactly ONE tab is in the page tab order
                 and Left/Right/Home/End move focus (and selection) between them. The inactive panel
                 carries the hidden attribute rather than being unmounted, so each tab's aria-controls
                 resolves to a panel that exists and so a conversation expanded in one period is still
                 expanded when the reader comes back.

                 Neither panel is display-flex itself: a Tailwind display utility on the same element
                 would out-rank the stylesheet's own [hidden] rule and the hidden panel would still
                 occupy space. The layout classes live on an inner wrapper instead. -->
            <div
              role="tablist"
              aria-label="Feed period"
              class="border-border flex items-end gap-4 border-b"
            >
              <button
                #todayTab
                type="button"
                role="tab"
                id="feed-tab-today"
                data-testid="feed-tab-today"
                class="hover:text-foreground -mb-px cursor-pointer border-b-2 px-1 pb-2 text-sm font-semibold tracking-wide uppercase transition-colors"
                [class.border-foreground]="feedTab() === 'today'"
                [class.border-transparent]="feedTab() !== 'today'"
                [class.text-foreground]="feedTab() === 'today'"
                [class.text-muted-foreground]="feedTab() !== 'today'"
                [attr.aria-selected]="feedTab() === 'today' ? 'true' : 'false'"
                aria-controls="feed-panel-today"
                [attr.tabindex]="feedTab() === 'today' ? 0 : -1"
                (click)="selectFeedTab('today')"
                (keydown)="onFeedTabKeydown($event)"
              >
                Today
              </button>
              <button
                #lastWeekTab
                type="button"
                role="tab"
                id="feed-tab-lastweek"
                data-testid="feed-tab-lastweek"
                class="hover:text-foreground -mb-px cursor-pointer border-b-2 px-1 pb-2 text-sm font-semibold tracking-wide uppercase transition-colors"
                [class.border-foreground]="feedTab() === 'lastweek'"
                [class.border-transparent]="feedTab() !== 'lastweek'"
                [class.text-foreground]="feedTab() === 'lastweek'"
                [class.text-muted-foreground]="feedTab() !== 'lastweek'"
                [attr.aria-selected]="feedTab() === 'lastweek' ? 'true' : 'false'"
                aria-controls="feed-panel-lastweek"
                [attr.tabindex]="feedTab() === 'lastweek' ? 0 : -1"
                (click)="selectFeedTab('lastweek')"
                (keydown)="onFeedTabKeydown($event)"
              >
                <!-- The count stays on the tab, where the collapsed disclosure header used to carry
                     it: a reader deciding whether to switch should see what they would switch TO, and
                     a count that only existed inside the panel would be one tap too late. -->
                <span data-testid="last-week-count"
                  >Last Week ({{ store.lastWeekTotalCount() }})</span
                >
              </button>
            </div>

            <div
              role="tabpanel"
              id="feed-panel-today"
              aria-labelledby="feed-tab-today"
              tabindex="0"
              [hidden]="feedTab() !== 'today'"
            >
              <div class="flex flex-col gap-3">
                <div class="flex flex-col gap-3" data-testid="feed-scroll">
                  @if (store.isLoading() && store.feedLinks().length === 0) {
                    <div hlmSkeleton class="h-24 w-full" data-testid="feed-skeleton"></div>
                  } @else if (store.feedLinks().length === 0 && !store.hasError()) {
                    <div
                      class="text-muted-foreground border-border flex flex-col items-center gap-3 rounded-xl border border-dashed p-6 text-center text-sm"
                      data-testid="feed-empty"
                    >
                      <span data-testid="feed-empty-copy">No links yet today — be the first</span>
                      <button
                        hlmBtn
                        size="sm"
                        variant="outline"
                        data-testid="feed-empty-cta"
                        (click)="openLinkSheet()"
                      >
                        Share a link
                      </button>
                    </div>
                  }
                  @for (link of store.feedLinks(); track link.id) {
                    <app-link-thread
                      [link]="link"
                      [userVote]="store.userVoteFor(link.id)"
                      [voteValues]="store.userVotes()"
                      [editable]="canEdit(link)"
                      (voteChanged)="onVoteChanged($event)"
                      (edit)="openEdit($event)"
                    />
                  }
                </div>
                @if (store.feedLinks().length > 0) {
                  <div class="mt-1 flex items-center justify-end gap-3" data-testid="feed-footer">
                    <span class="text-muted-foreground text-xs" data-testid="feed-count">
                      Showing {{ store.feedLinks().length }} of {{ store.feedTotalCount() }}
                    </span>
                    @if (canLoadMore()) {
                      <button
                        hlmBtn
                        variant="outline"
                        class="self-center"
                        data-testid="feed-load-more"
                        (click)="loadMore()"
                      >
                        Load More
                      </button>
                    }
                  </div>
                }
              </div>
            </div>

            <div
              role="tabpanel"
              id="feed-panel-lastweek"
              aria-labelledby="feed-tab-lastweek"
              data-testid="last-week-panel"
              tabindex="0"
              [hidden]="feedTab() !== 'lastweek'"
            >
              <div class="flex flex-col gap-3">
                @if (store.isLoadingLastWeek() && store.lastWeekLinks().length === 0) {
                  <div hlmSkeleton class="h-24 w-full" data-testid="last-week-skeleton"></div>
                } @else if (store.lastWeekLinks().length === 0 && !store.hasError()) {
                  <p
                    class="text-muted-foreground border-border rounded-xl border border-dashed p-6 text-center text-sm"
                    data-testid="last-week-empty"
                  >
                    No links in the last week.
                  </p>
                }
                @for (group of store.lastWeekDayGroups(); track group.key) {
                  <div class="flex flex-col gap-2" data-testid="last-week-day-group">
                    @if (group.label) {
                      <h2
                        class="text-muted-foreground text-sm font-semibold tracking-wide uppercase"
                      >
                        {{ group.label }}
                      </h2>
                    }
                    @for (link of group.links; track link.id) {
                      <app-link-thread
                        [link]="link"
                        [userVote]="store.userVoteFor(link.id)"
                        [voteValues]="store.userVotes()"
                        [editable]="canEdit(link)"
                        (voteChanged)="onVoteChanged($event)"
                        (edit)="openEdit($event)"
                      />
                    }
                  </div>
                }
                @if (canLoadMoreLastWeek()) {
                  <button
                    hlmBtn
                    variant="outline"
                    class="self-center"
                    data-testid="last-week-load-more"
                    (click)="loadMoreLastWeek()"
                  >
                    Load More
                  </button>
                }
              </div>
            </div>
          </section>
        </div>
      }

      <app-footer />
    </main>

    <!-- The mobile action bar. lg:hidden because from lg up the HERO's intent row and its refresh
         control are already above the fold on every layout, so a second copy would duplicate both.
         🔴 The acceptance this bar exists to satisfy is "no intent becomes unreachable on mobile":
         Report opens the chooser (which carries every intent, including the incident one the hero
         row does not), Refresh drives the SAME store.polling beat the countdown does — one beat,
         two affordances, never two beats — and Live map keeps the tracker one tap away so the hero's
         fourth CTA is not something mobile lost. The safe-area padding keeps the buttons
         clear of the iOS home indicator; main grows a matching bottom padding below lg so the bar
         never covers the last feed row. -->
    <div
      class="bg-card border-border fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t px-4 pt-2 pb-[env(safe-area-inset-bottom)] lg:hidden"
      data-testid="home-mobile-bar"
    >
      <button
        hlmBtn
        class="bg-brand text-brand-foreground hover:bg-brand/85 h-11 flex-1 text-base"
        data-testid="home-mobile-report"
        (click)="openReportChooser()"
      >
        Report
      </button>
      <button
        hlmBtn
        variant="outline"
        size="icon"
        class="size-11"
        aria-label="Refresh page data now"
        data-testid="home-mobile-refresh"
        (click)="refreshNow()"
      >
        <ng-icon name="lucideRefreshCw" class="size-4" aria-hidden="true" />
      </button>
      <a
        hlmBtn
        variant="ghost"
        size="icon"
        class="text-brand size-11"
        routerLink="/tracker"
        aria-label="Live train map"
        data-testid="home-mobile-map"
      >
        <ng-icon name="lucideMapPin" class="size-4" aria-hidden="true" />
      </a>
    </div>

    <!-- 🔴 THE CHOOSER IS MOUNTED FIRST, BEFORE EVERY OTHER SHEET, and that order is load-bearing
         rather than cosmetic. HlmSheet locks page scroll from an effect keyed on its own open signal,
         and Angular flushes effects in creation order — so a chooser that OPENS the line-status sheet
         has to be created before it, or the chooser's close (scroll unlock) would run AFTER the
         sheet's open (scroll lock) and leave a locked page behind a locked sheet. Moving this block
         down would reintroduce it; home.page.spec.ts pins the order. -->
    <app-report-chooser />

    <app-line-status-sheet [line]="sheetLine()" (submitted)="onLineStatusSubmitted()" />

    <app-link-sheet />

    <hlm-sheet
      data-testid="spotting-entry-sheet"
      [open]="reportSheet.isOpen()"
      (openChange)="reportSheet.setOpen($event)"
      side="right"
    >
      <div hlmSheetHeader>
        <h2 class="text-base font-semibold">Add a Spotting Entry</h2>
      </div>
      <div hlmSheetBody>
        <app-report-form #reportFormRef (submitted)="onSpottingSubmitted($event)" />
      </div>
      <div hlmSheetFooter>
        <button
          hlmBtn
          variant="ghost"
          size="sm"
          [disabled]="reportFormRef.isSubmitting()"
          (click)="reportFormRef.clear()"
        >
          Clear form
        </button>
        <div class="flex items-center gap-2">
          <button hlmBtn variant="outline" (click)="reportSheet.setOpen(false)">Cancel</button>
          <button
            hlmBtn
            data-testid="submit-spotting-entry"
            [disabled]="reportFormRef.isSubmitting() || reportFormRef.isPhotosCompressing()"
            (click)="reportFormRef.submit()"
          >
            {{
              reportFormRef.isSubmitting()
                ? "Submitting…"
                : reportFormRef.isPhotosCompressing()
                  ? "Processing photos…"
                  : "Submit"
            }}
          </button>
        </div>
      </div>
    </hlm-sheet>
  `,
})
export class HomePage implements OnDestroy {
  protected readonly store = inject(HomeStore);

  /** The one answer to "which layout is this page in" — `?view=` wins, else the stored preference.
   *  Read, never duplicated: the board's toggle and the Pro dashboard's `p` shortcut both write
   *  through the same service. */
  protected readonly viewMode = inject(HomeViewModeService);
  private readonly lineStatusSheet = inject(LineStatusSheetService);
  protected readonly reportSheet = inject(ReportSheetService);
  private readonly auth = inject(AuthService);

  /** The one submission surface the hero CTA and the mobile bar both open. */
  private readonly reportChooser = inject(ReportChooserService);

  /** Edit flow for feed links — the same shared sheet the insiden/situasi lists host. */
  protected readonly linkSheet = inject(LinkSheetService);

  /** The line the sheet is reporting on — the store owns the list, the sheet service the id. */
  protected readonly sheetLine = computed<LinePulse | null>(
    () => this.store.lines().find((line) => line.id === this.lineStatusSheet.lineId()) ?? null,
  );

  /**
   * `HomeStore` exposes `reloadAll()`, not the two `graphqlResource()`s behind it, so this is the
   * minimal `RetryableResource` adapter the shared banner needs — no auto-retry countdown, and
   * "Try Now" reloads both reads.
   */
  protected readonly errorResource: RetryableResource = {
    retryCountdownSec: () => null,
    retryNow: () => this.store.reloadAll(),
  };

  /** The click-driven replacement for the infinite-scroll sentinel: shown only while another
   * page exists and nothing is in flight. */
  protected readonly canLoadMore = computed(
    () =>
      Boolean(this.store.feedPageInfo()?.hasNextPage) &&
      !this.store.isLoading() &&
      !this.store.isLoadingMore(),
  );

  /** Pulls the next feed page — the page renders every loaded link, so there is no client-side
   * reveal step left to advance. */
  protected loadMore(): void {
    void this.store.loadMore();
  }

  /** 🔴 Which feed period the tab set has selected — `today` by default. This REPLACED the old
   *  `_lastWeekExpanded` disclosure flag, and it is a different shape of state on purpose: two
   *  periods of which exactly one is showing is an EXCLUSIVE choice, so one signal can hold it. The
   *  collapsed boolean could not have, which is why it grew the "Last Week" content into a section
   *  hanging below the feed rather than a tab beside it. Nothing is stored: the tab is page-local
   *  reading state, exactly as the flag was. */
  protected readonly feedTab = signal<FeedTab>("today");

  /** The two tab buttons, resolved through their template refs — the roving `tabindex` target set,
   *  read on a keydown rather than re-queried from the document. Optional (not `.required`) because
   *  the Pro branch renders neither: only the keydown reads them, and that needs the rider layout. */
  private readonly _todayTab = viewChild<ElementRef<HTMLButtonElement>>("todayTab");
  private readonly _lastWeekTab = viewChild<ElementRef<HTMLButtonElement>>("lastWeekTab");

  /** A click (or an arrow key) picks a period. Selection is immediate rather than deferred: with two
   *  panels there is nothing to defer for, and a tab that only moved focus would make a reader who
   *  clicked it read the wrong list. */
  protected selectFeedTab(tab: FeedTab): void {
    this.feedTab.set(tab);
  }

  /** 🔴 Roving-tabindex keyboard navigation for the feed tablist: `ArrowRight` / `ArrowLeft` step
   *  through the two tabs and WRAP, and `Home` / `End` jump to the ends. Every other key is left
   *  alone — notably Tab, which must still leave the tablist (only the selected tab is in the page
   *  tab order, so tabbing out and Shift-tabbing back lands on it again). `preventDefault` runs only
   *  on a key this handler acts on, so the browser's own arrow scrolling is still available
   *  everywhere else in the page.
   *
   *  Arrow keys MOVE focus rather than only selection because the pattern is automatic activation:
   *  with two instant panels the alternative (move focus, await Enter) makes the reader press a key
   *  to see the list they just asked for. */
  protected onFeedTabKeydown(event: KeyboardEvent): void {
    const current = FEED_TABS.indexOf(this.feedTab());
    // 🔴 The modulo is applied PER BRANCH and the unhandled keys `return`, rather than one
    // `target < 0` sentinel test at the end: a single sentinel cannot tell "ArrowLeft off the first
    // tab, which wraps to the last" (a legitimate index of -1) from "a key this handler does not
    // own" (nothing at all), and conflating the two silently makes the left end a dead stop.
    let next: number;
    if (event.key === "ArrowRight") {
      next = (current + 1) % FEED_TABS.length;
    } else if (event.key === "ArrowLeft") {
      next = (current - 1 + FEED_TABS.length) % FEED_TABS.length;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = FEED_TABS.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const tab = FEED_TABS[next];
    this.feedTab.set(tab);
    (tab === "today" ? this._todayTab() : this._lastWeekTab())?.nativeElement.focus();
  }

  /** The last-week Load More: shown only while another day-aligned page exists and nothing is in
   * flight. */
  protected readonly canLoadMoreLastWeek = computed(
    () =>
      Boolean(this.store.lastWeekPageInfo()?.hasNextPage) &&
      !this.store.isLoadingLastWeek() &&
      !this.store.isLoadingMoreLastWeek(),
  );

  /** Pulls the next day-aligned last-week page. */
  protected loadMoreLastWeek(): void {
    void this.store.loadMoreLastWeek();
  }

  /** Previous shared-link-sheet state, so the effect can detect its open→closed edge. */
  private _wasLinkSheetOpen = false;

  constructor() {
    // Set the route's description for crawlers and link previews. `Meta.updateTag` writes into the
    // document the server rendered, so the tag is in the SSR HTML rather than only appearing after
    // hydration — the same one-line call `MethodologyPage` makes.
    inject(Meta).updateTag({ name: "description", content: META_DESCRIPTION });

    this.store.start();
    effect(() => {
      const isOpen = this.linkSheet.isOpen();
      if (!isOpen && this._wasLinkSheetOpen) {
        this.store.reloadAll();
      }
      this._wasLinkSheetOpen = isOpen;
    });
  }

  /**
   * The mobile bar's Report (and the hero's, through the same service): one chooser for every
   * intent, so "Report a delay" and "Report" on a phone cannot mean two different flows.
   */
  protected openReportChooser(): void {
    this.reportChooser.open();
  }

  /**
   * The mobile bar's Refresh: the SAME `PollingSource.refreshNow()` the countdown's own click calls,
   * deliberately rather than a second code path into `reloadFirstPages()`. One beat, so a click on
   * the bar is the click the countdown was counting down to — and the hero's control still owns the
   * "Updating" / "Updated" state, because at mobile widths it is not rendered.
   */
  protected refreshNow(): void {
    this.store.polling.refreshNow();
  }

  /** The empty feed's "Share a link" — the same shared sheet the card pencil and hero use. */
  protected openLinkSheet(): void {
    this.linkSheet.open();
  }

  /** Author-or-admin gate for the card's edit pencil (mirrors LinkListComponent; the home feed
   * node carries `user.shortId`, so authorship is provable here too). */
  protected canEdit(link: LinkCardItem): boolean {
    return canEditLink(link, {
      isLoggedIn: this.auth.isLoggedIn(),
      isAdmin: this.auth.isAdmin(),
      userId: this.auth.user()?.uid ?? null,
    });
  }

  /** Opens the shared link sheet in edit mode; its close edge above reloads the feed. */
  protected openEdit(link: LinkCardItem): void {
    this.linkSheet.openEdit(link);
  }

  /**
   * Records a vote against the VOTED card's id, which `app-link-thread` reports — a thread member
   * is votable too, so hard-coding the root's id (as the old flat loop could, because it knew the
   * row) would file a member's vote under the group.
   *
   * The vote OVERLAY lives in the store and reaches the wrapper as one `voteValues` map bound from
   * `store.userVotes()` rather than as page-local state: the wrapper renders N cards per row (root
   * + members), so a per-page map would have to be merged from the store's anyway — a copy that can
   * only drift. `store.setUserVote` remains the single write path.
   */
  protected onVoteChanged(event: { id: string; value: number }): void {
    this.store.setUserVote(event.id, event.value);
  }

  /**
   * A successful line-status report: reload, then take the reader back to the line they just
   * reported about. The id comes from `LineStatusSheetService.lineId`, which deliberately SURVIVES
   * the close — so the page never has to guess which sheet just closed, and two reports in a row on
   * two different lines each highlight their own.
   */
  protected onLineStatusSubmitted(): void {
    const lineId = this.lineStatusSheet.lineId();
    this.store.reloadAll();
    if (lineId) {
      this.store.highlightLine(lineId);
    }
  }

  /**
   * The sheet closes on submit and the page data reloads so the new entry shows up. The reported
   * line rides along on the output so the board can ring it — the spotting form owns the line the
   * reader picked and consumes its one-shot seed, so by the time this runs the service's `lineId` is
   * already null and the payload is the only honest source.
   */
  protected onSpottingSubmitted(lineId: string | null = null): void {
    this.reportSheet.setOpen(false);
    this.store.reloadAll();
    if (lineId) {
      this.store.highlightLine(lineId);
    }
  }

  ngOnDestroy(): void {
    this.store.stop();
  }
}
