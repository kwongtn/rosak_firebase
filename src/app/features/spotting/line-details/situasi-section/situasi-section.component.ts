import { Component, DestroyRef, computed, inject, input, signal, viewChild } from "@angular/core";
import { graphqlResource } from "../../../../core/graphql/graphql-client";
import { PollingSource } from "../../../../core/polling/polling-source";
import { HlmButton } from "../../../../ui/button/button";
import { HlmSkeleton } from "../../../../ui/skeleton/skeleton";
import { RetryBannerComponent } from "../../../../ui/retry-banner/retry-banner.component";
import { HlmSheet, HlmSheetBody, HlmSheetFooter, HlmSheetHeader } from "../../../../ui/sheet/sheet";
import { LinkCardComponent } from "../../../insiden/link-card/link-card.component";
import { LinkFormComponent } from "../../../insiden/link-form/link-form.component";
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
 * fetched by the shared `publicSocialMediaLinks(lineId)` query, submitted through the same
 * LinkFormComponent the /insiden page uses. Refresh behavior is a PollingSource wired to the
 * resource's reload() (the interval select and countdown mirror tracker's layer-checklist);
 * approved links render first, then a collapsed "Pending (N)" collapsible — same pattern as
 * LinksSectionComponent on /insiden. The submit sheet is hosted HERE (Pattern B): the parent
 * hosts the HlmSheet and the form component stays sheet-agnostic.
 */
@Component({
  selector: "app-situasi-section",
  imports: [
    HlmButton,
    HlmSkeleton,
    RetryBannerComponent,
    LinkCardComponent,
    LinkFormComponent,
    HlmSheet,
    HlmSheetHeader,
    HlmSheetBody,
    HlmSheetFooter,
  ],
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
        @if (approved().length === 0 && pending().length === 0) {
          <p class="text-muted-foreground text-sm">No submitted links for this line yet.</p>
        }
        <div class="flex flex-col gap-4">
          @for (link of approved(); track link.id) {
            <app-link-card [link]="link" />
          }
          @if (pending().length > 0) {
            <div class="flex flex-col gap-4">
              <button
                type="button"
                class="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-1.5 self-start text-sm font-semibold tracking-wide uppercase"
                [attr.aria-expanded]="pendingExpanded()"
                (click)="pendingExpanded.set(!pendingExpanded())"
              >
                <svg
                  viewBox="0 0 24 24"
                  class="size-4 shrink-0 transition-transform"
                  [class.rotate-180]="pendingExpanded()"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
                Pending ({{ pending().length }})
              </button>
              @if (pendingExpanded()) {
                @for (link of pending(); track link.id) {
                  <app-link-card [link]="link" />
                }
              }
            </div>
          }
        </div>
      }
    </div>

    <hlm-sheet
      [open]="linkSheet.isOpen()"
      (openChange)="linkSheet.setOpen($event)"
      side="right"
      [wide]="true"
    >
      <div hlmSheetHeader>
        <h2 class="text-base font-semibold">Submit a link</h2>
      </div>
      <div hlmSheetBody>
        <app-link-form [defaultLineIds]="[lineId()]" />
      </div>
      <div hlmSheetFooter>
        <button
          hlmBtn
          variant="ghost"
          size="sm"
          [disabled]="linkFormRef()?.isSubmitting() ?? false"
          (click)="linkFormRef()?.clear()"
        >
          Clear form
        </button>
        <div class="flex items-center gap-2">
          <button hlmBtn variant="outline" (click)="linkSheet.close()">Cancel</button>
          <button
            hlmBtn
            [disabled]="linkFormRef()?.isSubmitting() ?? false"
            (click)="linkFormRef()?.submit()"
          >
            {{ linkFormRef()?.isSubmitting() ? "Submitting…" : "Submit" }}
          </button>
        </div>
      </div>
    </hlm-sheet>
  `,
})
export class SituasiSectionComponent {
  readonly lineId = input.required<string>();

  protected readonly linkSheet = inject(LinkSheetService);
  protected readonly linkFormRef = viewChild(LinkFormComponent);

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
  private readonly _sorted = computed(() =>
    [...(this.resource.data()?.publicSocialMediaLinks.edges ?? [])]
      .map((edge) => edge.node)
      .sort((a, b) => b.created.localeCompare(a.created)),
  );

  protected readonly approved = computed(() => this._sorted().filter((link) => link.completed));
  protected readonly pending = computed(() => this._sorted().filter((link) => !link.completed));

  protected readonly pendingExpanded = signal(false);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.linkSheet.close());
  }

  protected onRefreshIntervalChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.polling.setIntervalMs(optionValueToRefreshInterval(value));
  }
}
