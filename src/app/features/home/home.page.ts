import { Component, computed, effect, inject, signal, type OnDestroy } from "@angular/core";

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
import { LinePulseListComponent } from "./line-pulse/line-pulse-list.component";
import { LineStatusSheetComponent } from "./line-status/line-status-sheet.component";
import { HomeRefreshControlComponent } from "./refresh-control/home-refresh-control.component";

/**
 * The community front page — the site's root route. The feed and the per-line pulse list share a
 * two-panel split (the URL list left, the line statuses right) from `lg` up, stacked on mobile;
 * the submit box heads the feed column and the retry banner and footer stay full width. The refresh
 * control (`app-home-refresh-control`) heads the LINKS section on mobile and the line panel on
 * desktop — one component, two visibility-gated instances, because the beat it drives refreshes
 * both sections.
 *
 * Route-scoped: HomeStore and LineStatusSheetService are provided by the `""` route in
 * app.routes.ts, so their polling beat and sheet state are created with the page and die with
 * it — hence `start()` in the constructor and `stop()` in `ngOnDestroy` (the beat must not
 * outlive the page). Data fetching, loading/empty states, the vote overlay and the refresh
 * countdown's confirmation all live in the store and the control; this page only composes.
 *
 * Every feed row renders through `app-link-thread` — the collapsible conversation wrapper — not
 * `app-link-card` directly, in BOTH the today feed and the Last Week day groups (the two
 * surfaces the plan ships conversation UI on). The wrapper renders the root as an ordinary card, so
 * an ungrouped link looks exactly as it did; it only adds a "N links" + chevron affordance when the
 * backend reports a non-zero `sublinkCount` on the root, with the children waiting inline under
 * `sublinks`. `HomeStore` asks the backend to collapse conversations for that to be possible at all
 * (see `HOME_FEED_COLLAPSE_VARS`).
 */
@Component({
  selector: "app-home-page",
  imports: [
    AppNavComponent,
    AppFooterComponent,
    LinkSubmitBoxComponent,
    LinkThreadComponent,
    LinkSheetComponent,
    LinePulseListComponent,
    LineStatusSheetComponent,
    HomeRefreshControlComponent,
    ReportFormComponent,
    RetryBannerComponent,
    HlmButton,
    HlmSheet,
    HlmSheetHeader,
    HlmSheetBody,
    HlmSheetFooter,
    HlmSkeleton,
  ],
  template: `
    <app-nav />

    <main class="mx-auto flex min-h-screen w-full flex-col gap-6 p-4 sm:p-6 lg:w-[90%]">
      @if (store.hasError()) {
        <app-retry-banner [resource]="errorResource" message="Couldn't load the front page." />
      }

      <div
        class="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start"
        data-testid="home-panels"
      >
        <section class="flex flex-col gap-3" aria-label="Community feed">
          <!-- The beat refreshes these links too, so on mobile the control heads the section it
               actually refreshes. CSS-only gate: SSR and hydration must see identical markup.
               The gate wrapper is itself a flex row that justifies the control right: a plain
               block wrapper would drop the flex-stretch the control relied on and shrink-wrap it
               to the section's left edge. -->
          <div class="flex justify-end lg:hidden">
            <app-home-refresh-control />
          </div>

          <app-link-submit-box (submitted)="store.reloadAll()" />

          <div class="flex flex-col gap-3" data-testid="feed-scroll">
            @if (store.isLoading() && store.feedLinks().length === 0) {
              <div hlmSkeleton class="h-24 w-full" data-testid="feed-skeleton"></div>
            } @else if (store.feedLinks().length === 0 && !store.hasError()) {
              <p
                class="text-muted-foreground border-border rounded-xl border border-dashed p-6 text-center text-sm"
                data-testid="feed-empty"
              >
                No links today yet.
              </p>
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

          <div class="flex flex-col gap-3">
            <button
              type="button"
              class="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-1.5 self-start text-sm font-semibold tracking-wide uppercase"
              data-testid="last-week-toggle"
              [attr.aria-expanded]="_lastWeekExpanded()"
              (click)="_lastWeekExpanded.set(!_lastWeekExpanded())"
            >
              <svg
                viewBox="0 0 24 24"
                class="size-4 shrink-0 transition-transform"
                [class.rotate-180]="_lastWeekExpanded()"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
              <span data-testid="last-week-count"
                >Last Week ({{ store.lastWeekTotalCount() }})</span
              >
            </button>

            @if (_lastWeekExpanded()) {
              <div class="flex flex-col gap-3" data-testid="last-week-panel">
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
            }
          </div>
        </section>

        <section class="flex flex-col gap-3" aria-label="Line status">
          <!-- Same control as the feed section has, shown from lg up where the line panel is
               the one next to the feed; the hidden/lg:flex pair keeps one instance visible, and
               justify-end keeps the control on the right now that the gate wraps it. -->
          <div class="hidden lg:flex justify-end">
            <app-home-refresh-control />
          </div>

          <app-line-pulse-list
            [lines]="store.lines()"
            [isLoading]="store.isLoading()"
            [refreshTick]="store.linesRefreshTick()"
          />
        </section>
      </div>

      <app-footer />
    </main>

    <app-line-status-sheet [line]="sheetLine()" (submitted)="store.reloadAll()" />

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
        <app-report-form #reportFormRef (submitted)="onSpottingSubmitted()" />
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
  private readonly lineStatusSheet = inject(LineStatusSheetService);
  protected readonly reportSheet = inject(ReportSheetService);
  private readonly auth = inject(AuthService);

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

  /** Collapsed by default — the last-week window stays out of the way until requested. */
  protected readonly _lastWeekExpanded = signal(false);

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
    this.store.start();
    effect(() => {
      const isOpen = this.linkSheet.isOpen();
      if (!isOpen && this._wasLinkSheetOpen) {
        this.store.reloadAll();
      }
      this._wasLinkSheetOpen = isOpen;
    });
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

  /** The sheet closes on submit and the page data reloads so the new entry shows up. */
  protected onSpottingSubmitted(): void {
    this.reportSheet.setOpen(false);
    this.store.reloadAll();
  }

  ngOnDestroy(): void {
    this.store.stop();
  }
}
