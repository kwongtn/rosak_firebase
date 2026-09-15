import { isPlatformBrowser } from "@angular/common";
import { Component, PLATFORM_ID, computed, inject, input } from "@angular/core";
import { graphqlResource } from "../../../../core/graphql/graphql-client";
import { HlmBadge } from "../../../../ui/badge/badge";
import { HlmSkeleton } from "../../../../ui/skeleton/skeleton";
import { RetryBannerComponent } from "../../../../ui/retry-banner/retry-banner.component";
import { ToastService } from "../../../../ui/toast/toast.service";
import {
  AssetType,
  LINE_STATION_ASSETS_QUERY,
  LineStationAssetsQueryData,
  LineStationAssetsQueryVars,
} from "../../data/spotting.queries";

const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  LIFT: "Lift",
  ESCALATOR: "Escalator",
};

/**
 * Read-only listing of each station's tracked assets (lifts, escalators) on this line — the
 * first piece of a larger "volunteers report station asset breakages" feature the backend
 * already has a real (if currently empty and status-blind) model for: `operation.models.Asset`
 * is a genuine Django model with a `status` field (under maintenance / in operation) and full
 * history tracking, but the GraphQL type doesn't expose `status` yet and there's no mutation for
 * reporting it — see the query's own doc comment in spotting.queries.ts. This section is
 * deliberately scoped to what's real *today* (what assets exist, per station) rather than
 * building UI against fields/mutations that don't exist on the backend yet; adding status
 * display and a report-a-breakage mutation is real follow-up work, not something to fake here.
 */
@Component({
  selector: "app-station-assets-section",
  imports: [HlmBadge, HlmSkeleton, RetryBannerComponent],
  template: `
    <div class="flex flex-col gap-3">
      <!-- bg-background sticky, matching every other section header on this page (the title
                 bar, the Spotting Activity heading + month-nav row) — this is the last section on
                 the page, so unlike those two there's nothing stacked below this one that needs to
                 know its own measured height; it only ever needs to know where *it* sticks. -mx-4/
                 px-4 (sm:-mx-6/px-6): same full-bleed trick as the other sticky bars, so the sticky
                 background doesn't show the page's own side padding as gaps down either edge. -->
      <div
        class="bg-background sticky z-[15] -mx-4 flex items-baseline justify-between gap-2 px-4 py-2 sm:-mx-6 sm:px-6"
        [style.top.px]="stickyOffset()"
      >
        <h2 id="station-assets" class="group flex items-center gap-1.5 text-lg font-semibold">
          Station Assets
          <!-- Copies a direct #station-assets link to this section — hidden until the
                         heading is hovered/focused so it doesn't visually compete with the text
                         the rest of the time. -->
          <button
            type="button"
            (click)="copyAnchorLink()"
            class="text-muted-foreground hover:text-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            aria-label="Copy link to Station Assets section"
            title="Copy link to this section"
          >
            <svg
              viewBox="0 0 24 24"
              class="size-4"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07l-1.42 1.42" />
              <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07l1.41-1.41" />
            </svg>
          </button>
        </h2>
        <p class="text-muted-foreground text-xs">
          Lifts &amp; escalators — status tracking coming soon
        </p>
      </div>
      @if (resource.isLoading()) {
        <div hlmSkeleton class="h-32 w-full"></div>
      } @else if (resource.hasError()) {
        <app-retry-banner [resource]="resource" message="Couldn't load station assets." />
      } @else if (stations().length === 0) {
        <p class="text-muted-foreground text-sm">This line has no stations on record.</p>
      } @else {
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          @for (station of stations(); track station.id) {
            <div class="border-border flex flex-col gap-2 rounded-lg border p-3">
              <h3 class="text-sm font-semibold">{{ station.displayName }}</h3>
              @if (station.assets.length === 0) {
                <p class="text-muted-foreground text-xs">No assets recorded yet.</p>
              } @else {
                <div class="flex flex-col gap-1.5">
                  @for (asset of station.assets; track asset.id) {
                    <div class="flex items-center gap-2 text-xs">
                      <span hlmBadge variant="outline">{{
                        ASSET_TYPE_LABEL[asset.assetType]
                      }}</span>
                      <span class="text-muted-foreground truncate">
                        {{ asset.shortDescription || asset.officialid || "—" }}
                      </span>
                    </div>
                  }
                </div>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class StationAssetsSectionComponent {
  readonly lineId = input.required<string>();
  /** Where this section's own sticky heading should stick — the parent (line-details.page.ts)
   * measures its own stacked sticky bars' real height and passes the total down, same pattern
   * as VehicleSpottingGridComponent's `stickyOffset`. */
  readonly stickyOffset = input(0);

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly toast = inject(ToastService);

  protected readonly ASSET_TYPE_LABEL = ASSET_TYPE_LABEL;

  protected copyAnchorLink(): void {
    if (!this.isBrowser) {
      return;
    }
    const url = `${window.location.origin}${window.location.pathname}#station-assets`;
    navigator.clipboard
      .writeText(url)
      .then(() =>
        this.toast.success("Link copied", "Direct link to Station Assets copied to clipboard."),
      )
      .catch(() => this.toast.error("Couldn't copy link"));
  }

  protected readonly resource = graphqlResource<
    LineStationAssetsQueryData,
    LineStationAssetsQueryVars
  >(() => ({
    query: LINE_STATION_ASSETS_QUERY,
    variables: { lineId: this.lineId() },
  }));

  protected readonly stations = computed(() => this.resource.data()?.lines[0]?.stations ?? []);
}
