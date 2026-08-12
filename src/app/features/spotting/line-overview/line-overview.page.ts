import {
  Component,
  computed,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { Router, RouterLink } from "@angular/router";
import { graphqlResource } from "../../../core/graphql/graphql-client";
import { HlmBadge } from "../../../ui/badge/badge";
import { HlmButton } from "../../../ui/button/button";
import { HlmSkeleton } from "../../../ui/skeleton/skeleton";
import { RetryBannerComponent } from "../../../ui/retry-banner/retry-banner.component";
import { ToastService } from "../../../ui/toast/toast.service";
import { LineStatusBadge } from "../../../domain-ui/line-status-badge/line-status-badge";
import { VehicleStatus } from "../../../core/graphql/types";
import { SpottingLinesStore } from "../data/spotting-lines.store";
import {
  VEHICLE_TYPES_QUERY,
  VehicleTypesQueryData,
  VehicleTypesQueryVars,
} from "../data/spotting.queries";
import { FleetSummaryComponent } from "./fleet-summary/fleet-summary.component";
import { LineStatusBoardComponent } from "./line-status-board/line-status-board.component";
import { LineSwitcherComponent } from "./line-switcher/line-switcher.component";
import { VehicleListComponent } from "./vehicle-list/vehicle-list.component";
import { ReportSpottingButtonComponent } from "../report-spotting-button/report-spotting-button.component";

/**
 * /spotting/:lineId — a rail line's fleet, replacing the old app's in-component tab bar with a
 * real route per line (see the rewrite plan's routing rationale): the browser back button and
 * deep links now behave predictably, and an unrecognized line redirects with a toast instead of
 * silently showing nothing.
 */
@Component({
  selector: "app-line-overview",
  imports: [
    RouterLink,
    HlmBadge,
    HlmButton,
    HlmSkeleton,
    LineStatusBadge,
    FleetSummaryComponent,
    LineStatusBoardComponent,
    LineSwitcherComponent,
    VehicleListComponent,
    ReportSpottingButtonComponent,
    RetryBannerComponent,
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex items-center justify-between gap-2 sm:hidden">
        <app-report-spotting-button />
        <a [routerLink]="['/spotting', lineId(), 'details']" hlmBtn variant="outline" size="sm"
          >Details</a
        >
      </div>

      <nav class="hidden flex-wrap gap-2.5 sm:flex">
        @for (line of linesStore.lines(); track line.id) {
          <a
            [routerLink]="['/spotting', line.id]"
            hlmBadge
            [variant]="line.id === lineId() ? 'default' : 'outline'"
            [title]="line.displayName"
            class="px-4 py-2 text-sm"
          >
            {{ line.code }}
          </a>
        }
      </nav>

      <!-- top-[61px], not top-0: app-nav is sticky too now, and 61px is its own measured
                 height — sticking at top-0 here would fight it for the same top-of-viewport slot
                 instead of stacking directly beneath it. min-h-14 (not h-14): once scrolled, the
                 compact fleet summary below joins this row on desktop, and letting the row grow
                 (rather than clipping) if that ever needs to wrap is simpler than fighting for
                 horizontal space at every width. -->
      <div
        #stickyBar
        class="bg-background sticky top-[61px] z-20 -mx-4 flex min-h-14 flex-wrap items-center justify-between gap-2 px-4 py-2 sm:-mx-6 sm:px-6"
      >
        <app-line-switcher
          class="w-full sm:hidden"
          [lines]="linesStore.lines()"
          [currentLine]="_line()"
          (lineSelected)="onSwitchLine($event)"
        />

        @if (_line(); as line) {
          <!-- Desktop only (mobile keeps the fleet summary as its own row below the line
                         name, per the layout above) — the compact chips only join this line once
                         scrolled, replacing the full row that's scrolled out of view by then. -->
          <div class="hidden min-w-0 flex-1 flex-wrap items-center gap-3 sm:flex">
            <div class="flex shrink-0 items-center gap-3">
              <h1 class="text-xl font-semibold">{{ line.displayName }}</h1>
              <line-status-badge [status]="line.status" />
            </div>
            @if (_scrolled() && !vehicleTypesResource.isLoading()) {
              <app-fleet-summary
                [vehicleTypes]="_vehicleTypes()"
                [compact]="true"
                [activeStatus]="statusFilter()"
                (statusSelected)="statusFilter.set($event)"
              />
            }
          </div>
        }

        <div class="hidden shrink-0 items-center gap-2 sm:flex">
          <a [routerLink]="['/spotting', lineId(), 'details']" hlmBtn variant="outline" size="sm"
            >Details</a
          >
          <app-report-spotting-button />
        </div>
      </div>

      @if (vehicleTypesResource.hasError()) {
        <app-retry-banner
          [resource]="vehicleTypesResource"
          message="Couldn't load this line's fleet."
        />
      } @else {
        <app-line-status-board
          [vehicleTypes]="_vehicleTypes()"
          [isLoading]="vehicleTypesResource.isLoading()"
        />

        @if (vehicleTypesResource.isLoading()) {
          <div hlmSkeleton class="h-24 w-full"></div>
        } @else {
          <app-fleet-summary
            #fleetSummaryAnchor
            class="fleet-summary-merge-anchor"
            [vehicleTypes]="_vehicleTypes()"
            [activeStatus]="statusFilter()"
            (statusSelected)="statusFilter.set($event)"
          />

          <div class="flex flex-col gap-6">
            @for (vehicleType of _vehicleTypes(); track vehicleType.id) {
              <app-vehicle-list
                [vehicleType]="vehicleType"
                [statusFilter]="statusFilter()"
                [stickyOffset]="vehicleListStickyTop()"
                (statusSelected)="statusFilter.set($event)"
              />
            }
          </div>
        }
      }
    </div>
  `,
})
export class LineOverviewPage {
  readonly lineId = input.required<string>();

  protected readonly linesStore = inject(SpottingLinesStore);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly _line = computed(() => this.linesStore.lineById(this.lineId()));
  protected readonly statusFilter = signal<VehicleStatus | null>(null);

  protected readonly vehicleTypesResource = graphqlResource<
    VehicleTypesQueryData,
    VehicleTypesQueryVars
  >(() => ({
    query: VEHICLE_TYPES_QUERY,
    variables: { lineId: this.lineId() },
  }));

  protected readonly _vehicleTypes = computed(
    () => this.vehicleTypesResource.data()?.vehicleTypes ?? [],
  );

  /** Drives the desktop fleet-summary merge into the sticky line-name row (see the template) —
   * true once the *original*, full fleet-summary row (below) has scrolled up behind the sticky
   * bars above it, not just "the page has scrolled at all". Measured via IntersectionObserver
   * against `fleetSummaryAnchor` rather than a scrollY threshold, so it stays correct regardless
   * of how tall the page above that row happens to be for a given line. */
  private readonly fleetSummaryAnchor = viewChild("fleetSummaryAnchor", { read: ElementRef });
  protected readonly _scrolled = signal(false);
  private summaryObserver: IntersectionObserver | undefined;

  /** This sticky bar's own real rendered height — it's `min-h-14`, not a fixed `h-14`, so it
   * grows (e.g. once the compact fleet summary joins it, or the Details/Add-a-Spotting-Entry
   * buttons wrap on a narrower desktop width) beyond the 56px a fixed height would guarantee.
   * Every *other* sticky bar stacked below this one needs to offset by however tall this one
   * actually is right now, not a guessed constant — a stale guess is exactly what silently
   * clipped vehicle-list's own sticky header behind this bar whenever it grew past 56px. */
  private readonly stickyBar = viewChild("stickyBar", { read: ElementRef });
  protected readonly stickyBarHeight = signal(56);
  protected readonly vehicleListStickyTop = computed(() => 61 + this.stickyBarHeight());
  private stickyBarObserver: ResizeObserver | undefined;

  constructor() {
    // Clear the status filter when navigating to a different line — it shouldn't silently
    // carry over and hide vehicles on a line the user hasn't looked at yet.
    effect(() => {
      this.lineId();
      this.statusFilter.set(null);
    });

    // Top rootMargin = vehicle-list's own sticky offset (nav + this page's sticky row,
    // *measured*, not guessed — see stickyBarHeight above). That shifts the observer's
    // effective viewport up by exactly the sticky bars' real height, so "not intersecting"
    // fires precisely when the anchor scrolls up behind them, not merely off the top of the
    // *visual* viewport. Re-creates the observer whenever that offset itself changes (e.g.
    // the sticky row wraps to a second line), since rootMargin can't be updated in place.
    effect(() => {
      const anchorRef = this.fleetSummaryAnchor();
      const stickyTop = this.vehicleListStickyTop();
      this.summaryObserver?.disconnect();
      this.summaryObserver = undefined;
      if (!anchorRef || typeof IntersectionObserver === "undefined") {
        return;
      }
      // Hydration can occasionally leave this query pointing at a since-replaced node — a
      // disconnected element always measures as an empty rect, which reads as "scrolled
      // past" even at the very top of the page. By the time this effect runs, the real
      // element already exists in the document, so fall back to a plain lookup by the same
      // marker class rather than trusting a stale ElementRef.
      const anchor = anchorRef.nativeElement.isConnected
        ? anchorRef.nativeElement
        : document.querySelector<HTMLElement>(".fleet-summary-merge-anchor");
      if (!anchor) {
        return;
      }
      const observer = new IntersectionObserver(
        ([entry]) => {
          // Guard against IntersectionObserver's own first callback, which fires the
          // instant `.observe()` is called and can catch the anchor before it has real
          // layout yet (a 0×0 boundingClientRect) — that reports as "not intersecting"
          // regardless of where the element actually ends up, which permanently flipped
          // `_scrolled` to true on page load, before any real scrolling, every time.
          // Only a genuinely measured (non-zero) rect is trustworthy.
          const rect = entry.boundingClientRect;
          if (rect.width === 0 && rect.height === 0) {
            return;
          }
          this._scrolled.set(!entry.isIntersecting);
        },
        { rootMargin: `-${stickyTop}px 0px 0px 0px` },
      );
      observer.observe(anchor);
      this.summaryObserver = observer;
    });
    this.destroyRef.onDestroy(() => this.summaryObserver?.disconnect());

    effect(() => {
      const barRef = this.stickyBar();
      this.stickyBarObserver?.disconnect();
      this.stickyBarObserver = undefined;
      if (!barRef || typeof ResizeObserver === "undefined") {
        return;
      }
      const observer = new ResizeObserver(([entry]) => {
        const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
        if (height > 0) {
          this.stickyBarHeight.set(height);
        }
      });
      observer.observe(barRef.nativeElement);
      this.stickyBarObserver = observer;
    });
    this.destroyRef.onDestroy(() => this.stickyBarObserver?.disconnect());

    effect(() => {
      if (this.linesStore.isLoading() || this.linesStore.lines().length === 0) {
        return;
      }
      if (!this._line() && this.isBrowser) {
        // Browser-only: triggering this navigate() during SSR (a stale/bad direct link)
        // hangs the whole SSR render entirely rather than producing the redirect — a real
        // bug in how a *reactive*, post-initial-render navigation interacts with
        // Angular's SSR redirect handling (unlike the router's own bare `/spotting` →
        // first-line redirect, which fires before any content renders and works fine).
        // Deferring to the client means a direct hit on a stale link renders blank during
        // SSR and redirects immediately on hydration instead of hanging indefinitely.
        const fallback = this.linesStore.firstLineId();
        this.toast.error("Line not found", "Showing the first available line instead.");
        if (fallback) {
          this.router.navigate(["/spotting", fallback], { replaceUrl: true });
        }
      }
    });
  }

  protected onSwitchLine(lineId: string): void {
    this.router.navigate(["/spotting", lineId]);
  }
}
