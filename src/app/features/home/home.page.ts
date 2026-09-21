import { Component, computed, inject, type OnDestroy } from "@angular/core";

import { AppFooterComponent } from "../../shell/app-footer/app-footer.component";
import { AppNavComponent } from "../../shell/app-nav/app-nav.component";
import { InfiniteScrollDirective } from "../../ui/infinite-scroll/infinite-scroll.directive";
import {
  RetryBannerComponent,
  type RetryableResource,
} from "../../ui/retry-banner/retry-banner.component";
import { HlmSkeleton } from "../../ui/skeleton/skeleton";
import { LinePulse } from "./data/home.queries";
import { HomeStore } from "./data/home.store";
import { LineStatusSheetService } from "./data/line-status-sheet.service";
import { FeedLinkCardComponent } from "./feed/feed-link-card.component";
import { LinkSubmitBoxComponent } from "./feed/link-submit-box.component";
import { LinePulseListComponent } from "./line-pulse/line-pulse-list.component";
import { LineStatusSheetComponent } from "./line-status/line-status-sheet.component";

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
    FeedLinkCardComponent,
    LinePulseListComponent,
    LineStatusSheetComponent,
    InfiniteScrollDirective,
    RetryBannerComponent,
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
        @if (store.isLoading() && store.feedLinks().length === 0) {
          <div hlmSkeleton class="h-24 w-full"></div>
        }
        @for (link of store.feedLinks(); track link.id) {
          <app-feed-link-card
            [link]="link"
            [userVote]="store.userVoteFor(link.id)"
            (voteChanged)="store.setUserVote(link.id, $event.value)"
          />
        }
        @if (store.feedPageInfo()?.hasNextPage) {
          <div
            appInfiniteScroll
            [appInfiniteScrollLoading]="store.isLoading()"
            (loadMore)="store.loadMore()"
            class="h-px"
            aria-hidden="true"
          ></div>
        }
      </section>

      <section aria-label="Line status">
        <app-line-pulse-list [lines]="store.lines()" [isLoading]="store.isLoading()" />
      </section>

      <app-footer />
    </main>

    <app-line-status-sheet [line]="sheetLine()" (submitted)="store.reloadAll()" />
  `,
})
export class HomePage implements OnDestroy {
  protected readonly store = inject(HomeStore);
  private readonly lineStatusSheet = inject(LineStatusSheetService);

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

  constructor() {
    this.store.start();
  }

  ngOnDestroy(): void {
    this.store.stop();
  }
}
