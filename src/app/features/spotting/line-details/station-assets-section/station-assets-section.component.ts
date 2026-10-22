import { Component, computed, inject, input } from "@angular/core";
import { RouterLink } from "@angular/router";
import { injectIsBrowser } from "../../../../core/composables/is-browser";
import { graphqlResource } from "../../../../core/graphql/graphql-client";
import { revalidateOnReturn } from "../../../../core/routing/revalidate-on-return";
import { isSpottingDetailsRoute } from "../../data/spotting-route-patterns";
import { AssetStatusBadge } from "../../../../domain-ui/asset-status-badge/asset-status-badge";
import { HlmBadge } from "../../../../ui/badge/badge";
import { HlmSkeleton } from "../../../../ui/skeleton/skeleton";
import { RetryBannerComponent } from "../../../../ui/retry-banner/retry-banner.component";
import { ToastService } from "../../../../ui/toast/toast.service";
import {
  ASSET_TYPE_LABEL,
  LINE_STATION_ASSETS_QUERY,
  LineStationAssetsQueryData,
  LineStationAssetsQueryVars,
} from "../../data/spotting.queries";

/**
 * Read-only listing of each station's tracked assets (lifts, escalators) on this line, with each
 * asset's status (`asset-status-badge`: "In service" / "Out of service"). That status is entered by
 * the team in the backend (nothing else writes it today), not taken from live rider reports, and the
 * section says so — a rider relying on a lift must know the badge can lag behind a breakdown. The
 * note shows only while a status is on screen to qualify.
 *
 * This is the first half of a "volunteers report station asset breakages" feature. The second
 * half (a report mutation, and a rule that turns reports into a status) does not exist on the
 * backend, and is deliberately not faked here: see docs/components/spotting.md. The status
 * itself is a real field (`Asset.status`, selected in spotting.queries.ts).
 */
@Component({
  selector: "app-station-assets-section",
  imports: [RouterLink, AssetStatusBadge, HlmBadge, HlmSkeleton, RetryBannerComponent],
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
        <p class="text-muted-foreground text-xs">Lifts &amp; escalators</p>
      </div>
      <!-- Outside the sticky header on purpose: a sentence here would make the pinned bar taller
           on a phone, and it is only worth reading once, not while scrolling. -->
      @if (hasAssets()) {
        <p class="text-muted-foreground text-xs" data-testid="asset-status-note">
          Each asset's status is set by the MLPTF team, not reported live by riders, so it can lag
          behind a breakdown.
        </p>
      }
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
              <!-- The name opens the station's page (its lines, incidents and reports). -->
              <h3 class="text-sm font-semibold">
                <a
                  [routerLink]="['/station', station.id]"
                  class="underline-offset-2 hover:underline"
                  data-testid="station-assets-station"
                  >{{ station.displayName }}</a
                >
              </h3>
              @if (station.assets.length === 0) {
                <p class="text-muted-foreground text-xs">No assets recorded yet.</p>
              } @else {
                <div class="flex flex-col gap-1.5">
                  @for (asset of station.assets; track asset.id) {
                    <div class="flex items-center gap-2 text-xs" data-testid="station-asset">
                      <span hlmBadge variant="outline">{{
                        ASSET_TYPE_LABEL[asset.assetType]
                      }}</span>
                      <span class="text-muted-foreground truncate">
                        {{ asset.shortDescription || asset.officialid || "—" }}
                      </span>
                      <asset-status-badge class="ml-auto shrink-0" [status]="asset.status" />
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

  private readonly isBrowser = injectIsBrowser();
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
  protected readonly hasAssets = computed(() =>
    this.stations().some((station) => station.assets.length > 0),
  );

  constructor() {
    // Keep-alive retains stale data, so silently revalidate when the details route is re-entered.
    revalidateOnReturn(isSpottingDetailsRoute, () => {
      this.resource.reload();
    });
  }
}
