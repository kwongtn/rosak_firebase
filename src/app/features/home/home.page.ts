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
import { LinkCardComponent } from "../insiden/link-card/link-card.component";
import { LinkSheetComponent } from "../insiden/link-sheet/link-sheet.component";
import { LinePulse } from "./data/home.queries";
import { FEED_PAGE_SIZE, HomeStore } from "./data/home.store";
import { LineStatusSheetService } from "./data/line-status-sheet.service";
import { LinkSubmitBoxComponent } from "./feed/link-submit-box.component";
import { LinePulseListComponent } from "./line-pulse/line-pulse-list.component";
import { LineStatusSheetComponent } from "./line-status/line-status-sheet.component";

/** How many feed cards the list reveals at once. Tied to the store's fetch page size so the
 * first render is exactly one fetched page and one "Load More" reveals one continuation page. */
export const FEED_INITIAL_VISIBLE = FEED_PAGE_SIZE;

/**
 * The community front page — the site's root route. One global rolling feed at the top, the
 * per-line pulse list below it, with the submit box above both (see the ordering rationale in
 * the page's own layout: submit → feed → lines).
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
      <app-link-submit-box (submitted)="store.reloadAll()" />

      @if (store.hasError()) {
        <app-retry-banner [resource]="errorResource" message="Couldn't load the front page." />
      }

      <section class="flex flex-col gap-3" aria-label="Community feed">
        <div class="flex max-h-[60vh] flex-col gap-3 overflow-y-auto" data-testid="feed-scroll">
          @if (store.isLoading() && store.feedLinks().length === 0) {
            <div hlmSkeleton class="h-24 w-full"></div>
          }
          @for (link of visibleFeedLinks(); track link.id) {
            <app-link-card
              [link]="link"
              [userVote]="store.userVoteFor(link.id)"
              [editable]="canEdit(link)"
              (voteChanged)="store.setUserVote(link.id, $event.value)"
              (edit)="openEdit($event)"
            />
          }
        </div>
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
      </section>

      <section aria-label="Line status">
        <app-line-pulse-list [lines]="store.lines()" [isLoading]="store.isLoading()" />
      </section>

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

  /** How many feed cards the scroll container currently reveals; grows by one chunk per click. */
  private readonly visibleCount = signal(FEED_INITIAL_VISIBLE);

  /** The resident feed page(s), clipped to the revealed chunk — the list never renders more
   * cards than the user has asked for, even though the store may hold more. */
  protected readonly visibleFeedLinks = computed(() =>
    this.store.feedLinks().slice(0, this.visibleCount()),
  );

  /** The click-driven replacement for the infinite-scroll sentinel: shown only while another
   * page exists and nothing is in flight. */
  protected readonly canLoadMore = computed(
    () =>
      Boolean(this.store.feedPageInfo()?.hasNextPage) &&
      !this.store.isLoading() &&
      !this.store.isLoadingMore(),
  );

  /** Reveals the next chunk of already-fetched links and pulls a continuation page. */
  protected loadMore(): void {
    this.visibleCount.update((count) => count + FEED_INITIAL_VISIBLE);
    void this.store.loadMore();
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

  /** The sheet closes on submit and the page data reloads so the new entry shows up. */
  protected onSpottingSubmitted(): void {
    this.reportSheet.setOpen(false);
    this.store.reloadAll();
  }

  ngOnDestroy(): void {
    this.store.stop();
  }
}
