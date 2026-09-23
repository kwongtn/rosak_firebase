import { isPlatformBrowser } from "@angular/common";
import {
  Component,
  PLATFORM_ID,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  type OnDestroy,
} from "@angular/core";

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
import { LinkCardComponent } from "../insiden/link-card/link-card.component";
import { LinkSheetComponent } from "../insiden/link-sheet/link-sheet.component";
import { LinePulse } from "./data/home.queries";
import { HomeStore } from "./data/home.store";
import { LineStatusSheetService } from "./data/line-status-sheet.service";
import { LinkSubmitBoxComponent } from "./feed/link-submit-box.component";
import { LinePulseListComponent } from "./line-pulse/line-pulse-list.component";
import { LineStatusSheetComponent } from "./line-status/line-status-sheet.component";

/**
 * The community front page — the site's root route. The feed and the per-line pulse list share a
 * two-panel split (the URL list left, the line statuses right) from `lg` up, stacked on mobile;
 * the submit box heads the feed column and the retry banner and footer stay full width. The line
 * panel carries a 30s refresh countdown over the store's polling beat, above the list.
 *
 * Route-scoped: HomeStore and LineStatusSheetService are provided by the `""` route in
 * app.routes.ts, so their polling beat and sheet state are created with the page and die with
 * it — hence `start()` in the constructor and `stop()` in `ngOnDestroy` (the beat must not
 * outlive the page). Data fetching, loading/empty states and the vote overlay all live in the
 * store; this page only composes.
 */
@Component({
  selector: "app-home-page",
  imports: [
    AppNavComponent,
    AppFooterComponent,
    LinkSubmitBoxComponent,
    LinkCardComponent,
    LinkSheetComponent,
    LinePulseListComponent,
    LineStatusSheetComponent,
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
          <app-link-submit-box (submitted)="store.reloadAll()" />

          <div class="flex flex-col gap-3" data-testid="feed-scroll">
            @if (store.isLoading() && store.feedLinks().length === 0) {
              <div hlmSkeleton class="h-24 w-full" data-testid="feed-skeleton"></div>
            } @else if (store.feedLinks().length === 0 && !store.hasError()) {
              <p
                class="text-muted-foreground border-border rounded-xl border border-dashed p-6 text-center text-sm"
                data-testid="feed-empty"
              >
                No links yet.
              </p>
            }
            @for (link of store.feedLinks(); track link.id) {
              <app-link-card
                [link]="link"
                [userVote]="store.userVoteFor(link.id)"
                [editable]="canEdit(link)"
                (voteChanged)="store.setUserVote(link.id, $event.value)"
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
        </section>

        <section class="flex flex-col gap-3" aria-label="Line status">
          <button
            type="button"
            class="relative flex cursor-pointer flex-wrap items-center justify-end gap-2"
            data-testid="line-refresh-countdown"
            aria-label="Refresh line statuses now"
            (mouseenter)="onRefreshHoverEnter()"
            (mouseleave)="onRefreshHoverLeave()"
            (click)="onRefreshClick()"
          >
            @if (_showRefreshed()) {
              <svg
                class="text-muted-foreground size-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
                <path d="M20 6 9 17l-5-5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <span
                class="text-muted-foreground text-xs"
                data-testid="line-refresh-confirmation"
                role="status"
              >
                Updated
              </span>
            } @else if (store.polling.intervalMs() !== null) {
              <svg
                class="text-muted-foreground size-3.5 [animation-direction:reverse]"
                style="animation: spin 1s linear infinite"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-opacity="0.25"
                />
                <path
                  d="M21 12a9 9 0 0 0-9-9"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                />
              </svg>
              <span class="text-muted-foreground text-xs">
                Refreshing in {{ store.polling.secondsRemaining() }}s
              </span>
            }
            @if (_refreshTooltipOpen()) {
              <span
                role="tooltip"
                data-testid="line-refresh-tooltip"
                class="bg-popover text-popover-foreground border-border pointer-events-none absolute top-full right-0 z-10 mt-1.5 rounded-md border px-2 py-1 text-xs font-normal whitespace-nowrap shadow-md"
              >
                Click to Refresh Now
              </span>
            }
          </button>

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

  /** Previous shared-link-sheet state, so the effect can detect its open→closed edge. */
  private _wasLinkSheetOpen = false;

  /** Hover-capability of the refresh row's tooltip: measured (not guessed), the same way
   * `StatusInfoChipComponent` does — pointer devices hover/focus, everything else taps. */
  protected readonly _hoverCapable = signal(false);
  protected readonly _refreshTooltipOpen = signal(false);

  /** The transient "Updated" confirmation: shown once a manual refresh settles (see the effect
   * below), then hidden again by `_refreshedTimer`. */
  protected readonly _showRefreshed = signal(false);
  private _refreshPending = false;
  private _refreshedTimer: ReturnType<typeof setTimeout> | undefined;

  private readonly _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  constructor() {
    this.store.start();
    effect(() => {
      const isOpen = this.linkSheet.isOpen();
      if (!isOpen && this._wasLinkSheetOpen) {
        this.store.reloadAll();
      }
      this._wasLinkSheetOpen = isOpen;
    });
    effect(() => {
      const isLoading = this.store.isLoading();
      if (this._refreshPending && !isLoading) {
        this._refreshPending = false;
        this._showRefreshed.set(true);
        clearTimeout(this._refreshedTimer);
        this._refreshedTimer = setTimeout(() => this._showRefreshed.set(false), 2000);
      }
    });
    if (this._isBrowser) {
      afterNextRender(() => {
        if (typeof window.matchMedia === "function") {
          this._hoverCapable.set(window.matchMedia("(hover: hover) and (pointer: fine)").matches);
        }
      });
    }
  }

  protected onRefreshHoverEnter(): void {
    if (this._hoverCapable()) {
      this._refreshTooltipOpen.set(true);
    }
  }

  protected onRefreshHoverLeave(): void {
    if (this._hoverCapable()) {
      this._refreshTooltipOpen.set(false);
    }
  }

  /** The refresh row is the control now (the old separate button is gone): every click refreshes
   * and arms the "Updated" confirmation, and touch devices toggle the "Click to Refresh Now"
   * tooltip where they cannot hover. */
  protected onRefreshClick(): void {
    this._refreshPending = true;
    this.store.polling.refreshNow();
    if (!this._hoverCapable()) {
      this._refreshTooltipOpen.update((open) => !open);
    }
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

  /** The sheet closes on submit and the page data reloads so the new entry shows up. */
  protected onSpottingSubmitted(): void {
    this.reportSheet.setOpen(false);
    this.store.reloadAll();
  }

  ngOnDestroy(): void {
    clearTimeout(this._refreshedTimer);
    this.store.stop();
  }
}
