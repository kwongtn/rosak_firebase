import { Component, computed, signal } from "@angular/core";
import { graphqlResource } from "../../../core/graphql/graphql-client";
import { HlmSkeleton } from "../../../ui/skeleton/skeleton";
import { RetryBannerComponent } from "../../../ui/retry-banner/retry-banner.component";
import { LinkCardComponent } from "../link-card/link-card.component";
import {
  PUBLIC_SOCIAL_MEDIA_LINKS_QUERY,
  PublicSocialMediaLinksQueryData,
} from "../data/social-links.queries";

/**
 * The "Submitted Links" tab of /insiden: public social-media links (both approved and pending)
 * fetched by the shared `publicSocialMediaLinks` query. Approved (`completed === true`) cards
 * render first with no header, then — only when at least one pending link exists — a
 * collapsed-by-default "Pending (N)" collapsible using the repo's boolean-signal + @if
 * expand/collapse idiom (docs/components/insiden.md). If the backend query isn't deployed yet
 * the error state renders through the standard RetryBannerComponent, never a stub.
 */
@Component({
  selector: "app-links-section",
  imports: [HlmSkeleton, RetryBannerComponent, LinkCardComponent],
  template: `
    @if (isLoading()) {
      <div class="flex flex-col gap-4">
        <div hlmSkeleton class="h-24 w-full"></div>
        <div hlmSkeleton class="h-24 w-full"></div>
        <div hlmSkeleton class="h-24 w-full"></div>
      </div>
    } @else if (hasError()) {
      <app-retry-banner [resource]="linksResource" message="Couldn't load submitted links." />
    } @else {
      @if (approved().length === 0 && pending().length === 0) {
        <p class="text-muted-foreground text-sm">No submitted links yet.</p>
      }
      <div class="flex flex-col gap-4">
        @for (link of approved(); track link.id) {
          <app-link-card [link]="link" />
        }
        @if (pending().length > 0) {
          <div class="flex flex-col gap-4">
            <button
              type="button"
              class="flex cursor-pointer items-center gap-1.5 self-start text-muted-foreground text-sm font-semibold tracking-wide uppercase"
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
  `,
})
export class LinksSectionComponent {
  protected readonly linksResource = graphqlResource<PublicSocialMediaLinksQueryData>(() => ({
    query: PUBLIC_SOCIAL_MEDIA_LINKS_QUERY,
  }));

  protected readonly isLoading = this.linksResource.isLoading;
  protected readonly hasError = this.linksResource.hasError;

  /** Newest-first by creation time; the backend manages no pagination args, so sort client-side. */
  private readonly _sorted = computed(() =>
    [...(this.linksResource.data()?.publicSocialMediaLinks ?? [])].sort((a, b) =>
      b.created.localeCompare(a.created),
    ),
  );

  /** "Approved" on links = `completed === true` (the backend has no status enum for links). */
  protected readonly approved = computed(() => this._sorted().filter((link) => link.completed));
  protected readonly pending = computed(() => this._sorted().filter((link) => !link.completed));

  /** Collapsed by default — pending links stay out of the way until explicitly requested. */
  protected readonly pendingExpanded = signal(false);
}
