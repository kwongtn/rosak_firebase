import { Component, DestroyRef, computed, inject, input } from "@angular/core";
import { graphqlResource } from "../../../../core/graphql/graphql-client";
import { PollingSource } from "../../../../core/polling/polling-source";
import { HlmButton } from "../../../../ui/button/button";
import { HlmSkeleton } from "../../../../ui/skeleton/skeleton";
import { RetryBannerComponent } from "../../../../ui/retry-banner/retry-banner.component";
import { LinkListComponent } from "../../../insiden/link-list/link-list.component";
import { LinkSheetComponent } from "../../../insiden/link-sheet/link-sheet.component";
import {
  PUBLIC_SOCIAL_MEDIA_LINKS_QUERY,
  PublicSocialMediaLinksQueryData,
} from "../../../insiden/data/social-links.queries";
import { LinkSheetService } from "../../../insiden/data/link-sheet.service";

interface RefreshIntervalOption {
  label: string;
  value: string;
}

const REFRESH_INTERVAL_OPTIONS: RefreshIntervalOption[] = [
  { label: "10s", value: "10000" },
  { label: "30s", value: "30000" },
  { label: "1 min", value: "60000" },
  { label: "2 min", value: "120000" },
  { label: "5 min", value: "300000" },
  { label: "Never", value: "off" },
];

function refreshIntervalToOptionValue(ms: number | null): string {
  return ms == null ? "off" : String(ms);
}

function optionValueToRefreshInterval(value: string): number | null {
  return value === "off" ? null : Number(value);
}

/**
 * The "Situasi" tab of /spotting/:lineId/details — social-media links tagged to this line,
 * fetched by the shared `publicSocialMediaLinks(lineId)` query, submitted through the shared
 * LinkSheetComponent (line-prefilled via `defaultLineIds`). Refresh behavior is a PollingSource
 * wired to the resource's reload() (the interval select and countdown mirror tracker's
 * layer-checklist). List rendering (day grouping, pending collapsible, edit pencils) and the
 * sheet are both shared components from the insiden feature — this host owns only polling,
 * the header row, and reload-on-sheet-close.
 */
@Component({
  selector: "app-situasi-section",
  imports: [HlmButton, HlmSkeleton, RetryBannerComponent, LinkListComponent, LinkSheetComponent],
  template: `
    <div class="flex flex-col gap-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <h2 class="text-lg font-semibold">Situasi</h2>
          <button hlmBtn variant="outline" size="sm" (click)="linkSheet.open()">Submit link</button>
        </div>
        <div class="flex items-center gap-2">
          <select
            class="border-input bg-background rounded-md border px-1.5 py-1 text-xs font-normal"
            (click)="$event.stopPropagation()"
            (change)="onRefreshIntervalChange($event)"
          >
            @for (option of REFRESH_INTERVAL_OPTIONS; track option.value) {
              <option
                [value]="option.value"
                [selected]="option.value === refreshIntervalOptionValue()"
              >
                {{ option.label }}
              </option>
            }
          </select>
          @if (polling.intervalMs() !== null) {
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
              Refreshing in {{ polling.secondsRemaining() }}s
            </span>
          }
          <button hlmBtn variant="ghost" size="sm" (click)="polling.refreshNow()">
            Refresh now
          </button>
        </div>
      </div>

      @if (resource.isLoading()) {
        <div class="flex flex-col gap-4">
          <div hlmSkeleton class="h-24 w-full"></div>
          <div hlmSkeleton class="h-24 w-full"></div>
          <div hlmSkeleton class="h-24 w-full"></div>
        </div>
      } @else if (resource.hasError()) {
        <app-retry-banner
          [resource]="resource"
          message="Couldn't load submitted links for this line."
        />
      } @else {
        <app-link-list
          [links]="sorted()"
          emptyMessage="No submitted links for this line yet."
          (sheetClosed)="resource.reload()"
        />
      }
    </div>

    <app-link-sheet [defaultLineIds]="[lineId()]" />
  `,
})
export class SituasiSectionComponent {
  readonly lineId = input.required<string>();

  protected readonly linkSheet = inject(LinkSheetService);

  protected readonly REFRESH_INTERVAL_OPTIONS = REFRESH_INTERVAL_OPTIONS;

  protected readonly resource = graphqlResource<
    PublicSocialMediaLinksQueryData,
    { lineId: string }
  >(() => ({
    query: PUBLIC_SOCIAL_MEDIA_LINKS_QUERY,
    variables: { lineId: this.lineId() },
  }));

  protected readonly polling = new PollingSource(() => this.resource.reload());

  protected readonly refreshIntervalOptionValue = computed(() =>
    refreshIntervalToOptionValue(this.polling.intervalMs()),
  );

  /** Newest-first by creation time (backend order; sorted defensively). The connection's
   * first page is what this panel loads — matching the paginated contract of the shared
   * query (Task 16: no full-dataset link fetches). */
  protected readonly sorted = computed(() =>
    [...(this.resource.data()?.publicSocialMediaLinks.edges ?? [])]
      .map((edge) => edge.node)
      .sort((a, b) => b.created.localeCompare(a.created)),
  );

  constructor() {
    // Don't leave the sheet open for the next route's section.
    inject(DestroyRef).onDestroy(() => this.linkSheet.close());
  }

  protected onRefreshIntervalChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.polling.setIntervalMs(optionValueToRefreshInterval(value));
  }
}
