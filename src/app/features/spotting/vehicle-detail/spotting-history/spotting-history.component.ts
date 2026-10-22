import { Component, computed, effect, inject, input, signal, untracked } from "@angular/core";
import { DatePipe } from "@angular/common";
import { RouterLink } from "@angular/router";
import { NgIcon, provideIcons } from "@ng-icons/core";
import { lucideCamera } from "@ng-icons/lucide";
import { AuthService } from "../../../../core/auth/auth.service";
import { GraphQLClient } from "../../../../core/graphql/graphql-client";
import { HlmBadge } from "../../../../ui/badge/badge";
import { HlmButton } from "../../../../ui/button/button";
import { HlmSkeleton } from "../../../../ui/skeleton/skeleton";
import { VehicleStatusBadge } from "../../../../domain-ui/vehicle-status-badge/vehicle-status-badge";
import { SpottingTypeBadge } from "../../../../domain-ui/spotting-type-badge/spotting-type-badge";
import { WheelStatusBadge } from "../../../../domain-ui/wheel-status-badge/wheel-status-badge";
import {
  SpottingEvent,
  VEHICLE_EVENTS_QUERY,
  VehicleEventsQueryData,
  VehicleEventsQueryVars,
} from "../../data/spotting.queries";

const PAGE_SIZE = 20;

interface EventGroup {
  key: string;
  year: number;
  isNewYear: boolean;
  events: SpottingEvent[];
}

/**
 * Paginated per-vehicle spotting history. Uses a "Load more" button rather than the old app's
 * scroll-listener bound to an internal table DOM element — simpler, and works the same on touch
 * devices without depending on a specific table implementation's internal markup. Entries are
 * grouped by year/month — since the backend already orders by `spottingDate: DESC`, matching
 * entries are already contiguous, so grouping is a single linear pass.
 *
 * Every row also shows what the spotter logged beyond the basics, so contributing it is visibly
 * rewarded: run number, wheel condition, a photo count and a "Yours" tag on the viewer's own
 * entries. They share a second line under the date/type/status line, because the tag next to the
 * date pushed the status badge onto a line of its own at phone width. The photo count is a plain
 * chip, not a link: `medias` has no filter by spotting, so there is nothing to deep-link to.
 * Month headings are h3 because the card around the list carries the page's h2 (an h4 there skips
 * a level, which axe reports as heading-order).
 *
 * `isMine` is the backend's answer to "is this the asking user's entry", and it knows the asker
 * only from the `firebase-auth-key` header. So a signed-in viewer's requests carry their token (the
 * auth interceptor adds it and skips the SSR transfer cache), and when the viewer signs in or out
 * the first page is asked for again and swapped in where it stands. The server never has a
 * session, and a hard load asks before Firebase has restored one, so those first pages are
 * anonymous (every `isMine` false) and a restored session upgrades them a moment later.
 */
@Component({
  selector: "app-spotting-history",
  imports: [
    DatePipe,
    RouterLink,
    HlmBadge,
    HlmButton,
    HlmSkeleton,
    NgIcon,
    VehicleStatusBadge,
    SpottingTypeBadge,
    WheelStatusBadge,
  ],
  providers: [provideIcons({ lucideCamera })],
  template: `
    @if (_events().length === 0 && _isLoading()) {
      <div class="flex flex-col gap-2">
        <div hlmSkeleton class="h-12 w-full"></div>
        <div hlmSkeleton class="h-12 w-full"></div>
      </div>
    } @else if (_events().length === 0) {
      <p class="text-muted-foreground text-sm">No spottings logged yet.</p>
    } @else {
      <div class="flex flex-col gap-4">
        @for (group of _groups(); track group.key) {
          <div [class]="group.isNewYear ? 'border-border border-t pt-4' : ''">
            <h3 class="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">
              {{ group.events[0].spottingDate | date: "MMMM y" }}
            </h3>
            <ul class="flex flex-col">
              @for (event of group.events; track event.id) {
                <li class="flex flex-col gap-1.5 py-1.5" data-testid="history-row">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="text-sm font-medium">{{ event.spottingDate | date }}</span>
                      <spotting-type-badge [type]="event.type" />
                      <!-- Each station opens its own page. -->
                      @if (event.originStation) {
                        <span class="text-muted-foreground text-xs">
                          <a
                            [routerLink]="['/station', event.originStation.id]"
                            class="hover:text-foreground underline underline-offset-2"
                            data-testid="history-origin"
                            >{{ event.originStation.displayName }}</a
                          >
                          @if (event.destinationStation) {
                            →
                            <a
                              [routerLink]="['/station', event.destinationStation.id]"
                              class="hover:text-foreground underline underline-offset-2"
                              data-testid="history-destination"
                              >{{ event.destinationStation.displayName }}</a
                            >
                          }
                        </span>
                      }
                    </div>
                    <vehicle-status-badge [status]="event.status" />
                  </div>
                  @if (
                    event.isMine || event.runNumber || event.wheelStatus || event.mediaCount > 0
                  ) {
                    <div
                      class="text-muted-foreground flex flex-wrap items-center gap-2 text-xs"
                      data-testid="history-details"
                    >
                      @if (event.isMine) {
                        <span hlmBadge variant="secondary" data-testid="history-yours">Yours</span>
                      }
                      @if (event.runNumber) {
                        <span data-testid="history-run-number">Run {{ event.runNumber }}</span>
                      }
                      @if (event.wheelStatus) {
                        <span class="inline-flex items-center gap-1" data-testid="history-wheel">
                          Wheels
                          <wheel-status-badge [status]="event.wheelStatus" />
                        </span>
                      }
                      @if (event.mediaCount > 0) {
                        <span hlmBadge variant="outline" data-testid="history-media-count">
                          <ng-icon name="lucideCamera" class="size-3" aria-hidden="true" />
                          {{ event.mediaCount }} {{ event.mediaCount === 1 ? "photo" : "photos" }}
                        </span>
                      }
                    </div>
                  }
                  @if (event.notes) {
                    <p class="text-muted-foreground text-sm">{{ event.notes }}</p>
                  }
                </li>
              }
            </ul>
          </div>
        }
      </div>

      @if (_hasMore()) {
        <button
          hlmBtn
          variant="outline"
          size="sm"
          class="mt-4"
          [disabled]="_isLoading()"
          (click)="loadMore()"
        >
          {{ _isLoading() ? "Loading…" : "Load more" }}
        </button>
      }
    }
  `,
})
export class SpottingHistoryComponent {
  readonly vehicleId = input.required<string>();

  private readonly graphql = inject(GraphQLClient);
  private readonly auth = inject(AuthService);

  /**
   * Counts the page requests started. A response that finds the count moved on is stale (another
   * vehicle or viewer has been asked for since) and is dropped rather than put in a list it no
   * longer belongs to.
   */
  private latestRequest = 0;

  private readonly _eventsByVehicle = signal<Map<string, SpottingEvent[]>>(new Map());
  protected readonly _events = computed(() => this._eventsByVehicle().get(this.vehicleId()) ?? []);
  protected readonly _isLoading = signal(false);
  protected readonly _hasMore = signal(true);

  protected readonly _groups = computed<EventGroup[]>(() => {
    const groups: EventGroup[] = [];
    for (const event of this._events()) {
      const key = event.spottingDate.slice(0, 7);
      const year = Number(event.spottingDate.slice(0, 4));
      const last = groups.at(-1);
      if (last?.key === key) {
        last.events.push(event);
      } else {
        groups.push({ key, year, isNewYear: last ? last.year !== year : false, events: [event] });
      }
    }
    return groups;
  });

  constructor() {
    // Everything below must run untracked: this effect's only real dependencies are
    // vehicleId() and the viewer — reading _eventsByVehicle/_events here (even transitively, via
    // loadMore()) would make the effect re-run every time loadMore() itself writes new
    // results, wiping them out and re-fetching forever.
    effect(() => {
      // Both are read only to depend on them: another vehicle is another list, and a viewer who
      // signs in or out changes every row's isMine.
      this.vehicleId();
      this.auth.isLoggedIn();
      untracked(() => void this.loadMore(true));
    });
  }

  /**
   * Asks for the next page and appends it. With `restart` it asks for the first page instead, and
   * that replaces the list when it arrives, so what is on screen stays until then.
   */
  async loadMore(restart = false): Promise<void> {
    const request = ++this.latestRequest;
    const vehicleId = this.vehicleId();
    const offset = restart ? 0 : untracked(() => this._events().length);
    this._isLoading.set(true);
    try {
      // The auth interceptor signs a signed-in viewer's request; an anonymous one goes out at once.
      const data = await this.graphql.request<VehicleEventsQueryData, VehicleEventsQueryVars>(
        VEHICLE_EVENTS_QUERY,
        { vehicleId, limit: PAGE_SIZE, offset },
      );
      if (request !== this.latestRequest) {
        return;
      }
      this._hasMore.set(data.events.length === PAGE_SIZE);
      this._eventsByVehicle.update((map) => {
        const next = new Map(map);
        next.set(
          vehicleId,
          restart ? data.events : [...(next.get(vehicleId) ?? []), ...data.events],
        );
        return next;
      });
    } finally {
      // Only the newest request clears the flag; an older one leaves it to its replacement.
      if (request === this.latestRequest) {
        this._isLoading.set(false);
      }
    }
  }
}
