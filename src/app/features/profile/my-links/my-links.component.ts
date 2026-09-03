import { Component, PLATFORM_ID, effect, inject, input, signal, untracked } from "@angular/core";
import { DatePipe, isPlatformBrowser } from "@angular/common";
import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient } from "../../../core/graphql/graphql-client";
import { HlmBadge } from "../../../ui/badge/badge";
import { HlmButton } from "../../../ui/button/button";
import { HlmCardImports } from "../../../ui/card/card";
import { HlmSkeleton } from "../../../ui/skeleton/skeleton";
import { InfiniteScrollDirective } from "../../../ui/infinite-scroll/infinite-scroll.directive";
import {
  PUBLIC_SOCIAL_MEDIA_LINKS_QUERY,
  PublicSocialMediaLink,
  PublicSocialMediaLinksQueryData,
  PublicSocialMediaLinksVars,
} from "../../insiden/data/social-links.queries";
import { isPendingLink, linkStatusLabel } from "./my-links-status.util";

const PAGE_SIZE = 20;

/**
 * "My Submitted Links" (Task 23) — the one-way-street view from spec F2: a logged-in
 * user sees their own link submissions here (never others'), via the Task 10 `mine`
 * cursor-paginated connection. Data access mirrors <app-my-spottings> EXACTLY — this
 * is NOT graphqlResource (that is an HttpClient helper with no auth headers and would
 * 403 the `mine` filter): the idToken is minted per call and sent as firebase-auth-key;
 * on the server `auth.idToken()` resolves null and the query is skipped.
 */
@Component({
  selector: "app-my-links",
  imports: [DatePipe, HlmBadge, HlmButton, HlmSkeleton, InfiniteScrollDirective, ...HlmCardImports],
  template: `
    <div hlmCard>
      <div hlmCardHeader><h2 hlmCardTitle>My Submitted Links</h2></div>
      <div hlmCardContent>
        @if (_links().length === 0 && _isLoading()) {
          <div class="flex flex-col gap-4">
            <div hlmSkeleton class="h-24 w-full"></div>
            <div hlmSkeleton class="h-24 w-full"></div>
          </div>
        } @else if (_links().length === 0 && _loadError() !== null) {
          <div class="flex flex-col items-start gap-2">
            <p class="text-destructive text-sm">Couldn't load your submitted links.</p>
            <button
              type="button"
              hlmBtn
              variant="outline"
              size="sm"
              data-testid="retry-first-page"
              (click)="loadMore()"
            >
              Retry
            </button>
          </div>
        } @else if (_links().length === 0) {
          <p class="text-muted-foreground text-sm">No links submitted yet.</p>
        } @else {
          <div class="flex flex-col gap-3">
            @for (link of _links(); track link.id) {
              <a
                [href]="link.url"
                target="_blank"
                rel="noopener noreferrer"
                hlmCard
                class="gap-2.5 p-4 transition-colors hover:border-border/70"
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="flex min-w-0 flex-col gap-1">
                    <span class="line-clamp-1 text-sm font-semibold">
                      {{ link.title || link.url }}
                    </span>
                    @if (link.title) {
                      <span class="text-muted-foreground line-clamp-1 text-xs">
                        {{ link.url }}
                      </span>
                    }
                  </div>
                  <div class="flex shrink-0 flex-col items-end gap-1">
                    <span class="text-muted-foreground text-xs whitespace-nowrap">
                      {{ link.created | date: "MMM d, y HH:mm" }}
                    </span>
                    <span hlmBadge [variant]="isPendingLink(link) ? 'warning' : 'default'">
                      {{ linkStatusLabel(link) }}
                    </span>
                  </div>
                </div>
              </a>
            }

            @if (_hasMore()) {
              @if (_loadError() !== null) {
                <button
                  type="button"
                  hlmBtn
                  variant="outline"
                  size="sm"
                  class="self-start"
                  data-testid="retry-load-more"
                  (click)="loadMore()"
                >
                  Couldn't load more — retry
                </button>
              } @else {
                <div
                  appInfiniteScroll
                  [appInfiniteScrollLoading]="_isLoading()"
                  (loadMore)="loadMore()"
                  class="h-px"
                  aria-hidden="true"
                ></div>
              }
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class MyLinksComponent {
  /** Gate: this section is the caller's own submissions only (spec F2 one-way street). */
  readonly isOwnProfile = input.required<boolean>();

  protected readonly linkStatusLabel = linkStatusLabel;
  protected readonly isPendingLink = isPendingLink;

  private readonly graphql = inject(GraphQLClient);
  private readonly auth = inject(AuthService);
  /** Firebase-id-token requests only exist in the browser; on the server `auth.idToken()`
   * resolves null and the `mine` query would just fail (same reasoning as my-spottings). */
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly _links = signal<PublicSocialMediaLink[]>([]);
  protected readonly _isLoading = signal(false);
  protected readonly _hasMore = signal(false);
  private readonly _nextCursor = signal<string | null>(null);
  protected readonly _loadError = signal<string | null>(null);

  constructor() {
    // Only dependency is isOwnProfile(); loadMore() runs untracked so appending
    // pages never re-trigger this effect (same trap as my-spottings).
    effect(() => {
      if (this.isOwnProfile()) {
        untracked(() => void this.loadMore());
      }
    });
  }

  protected async loadMore(): Promise<void> {
    if (!this.isBrowser || this._isLoading()) {
      return;
    }
    this._isLoading.set(true);
    this._loadError.set(null);
    try {
      const idToken = await this.auth.idToken();
      const data = await this.graphql.request<
        PublicSocialMediaLinksQueryData,
        PublicSocialMediaLinksVars
      >(
        PUBLIC_SOCIAL_MEDIA_LINKS_QUERY,
        { mine: true, first: PAGE_SIZE, after: this._nextCursor() },
        idToken ? { "firebase-auth-key": idToken } : {},
      );
      const connection = data.publicSocialMediaLinks;
      this._links.update((list) => [...list, ...connection.edges.map((edge) => edge.node)]);
      this._hasMore.set(connection.pageInfo.hasNextPage);
      this._nextCursor.set(connection.pageInfo.endCursor);
    } catch (err) {
      this._loadError.set(err instanceof Error ? err.message : "Unknown error");
    } finally {
      this._isLoading.set(false);
    }
  }
}
