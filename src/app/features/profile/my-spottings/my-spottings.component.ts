import {
  Component,
  DestroyRef,
  PLATFORM_ID,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from "@angular/core";
import { DatePipe, isPlatformBrowser } from "@angular/common";
import { GraphQLClient } from "../../../core/graphql/graphql-client";
import { AuthService } from "../../../core/auth/auth.service";
import { RecaptchaService } from "../../../core/recaptcha/recaptcha.service";
import { HlmButton } from "../../../ui/button/button";
import { HlmCardImports } from "../../../ui/card/card";
import { HlmSheet, HlmSheetBody, HlmSheetHeader } from "../../../ui/sheet/sheet";
import { ToastService } from "../../../ui/toast/toast.service";
import { VehicleStatusBadge } from "../../../domain-ui/vehicle-status-badge/vehicle-status-badge";
import { SpottingTypeBadge } from "../../../domain-ui/spotting-type-badge/spotting-type-badge";
import {
  DELETE_EVENT_MUTATION,
  DELETE_WINDOW_MS,
  DeleteEventData,
  DeleteEventVars,
  GET_MY_EVENTS_QUERY,
  GetMyEventsData,
  GetMyEventsVars,
  MyEvent,
  PublicUserData,
} from "../data/profile.queries";

const PAGE_SIZE = 30;

interface EventDayGroup {
  date: string;
  events: MyEvent[];
}

/**
 * The user's own spotting history ("Historical Spottings"), ported from spottings.component.ts.
 * Uses a "Load more" button rather than the old scroll-listener-on-internal-table-DOM approach
 * (same simplification as the vehicle-detail spotting history). The delete window is computed
 * as the real 3 days the backend enforces (spotting/schema/schema.py), not the old app's 10-day
 * (`864e6` ms) client-side constant that let a false "delete" affordance show for 3–10-day-old
 * entries and then fail — see Known Quirks in profile.md.
 *
 * Entries are grouped by `spottingDate` rather than shown as one flat list — but grouping can't
 * just merge consecutive same-date rows the way the vehicle-detail history does: this list is
 * ordered by `created DESC` (submission time), not `spottingDate DESC`, since it's meant to read
 * as "what did I log recently." A catch-up entry logged today for last week sorts by *today*, so
 * two entries that share a `spottingDate` aren't guaranteed to be adjacent — grouping has to key
 * off the full accumulated list rather than a single linear pass.
 */
@Component({
  selector: "app-my-spottings",
  imports: [
    DatePipe,
    HlmButton,
    ...HlmCardImports,
    HlmSheet,
    HlmSheetHeader,
    HlmSheetBody,
    VehicleStatusBadge,
    SpottingTypeBadge,
  ],
  template: `
    <div hlmCard>
      <div hlmCardHeader><h2 hlmCardTitle>Historical Spottings</h2></div>
      <div hlmCardContent>
        @if (showPrivacyMessage()) {
          <div
            class="flex flex-col items-center gap-2 rounded-lg border border-border bg-muted/30 p-8 text-center"
          >
            <svg
              class="size-12 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            <h3 class="text-sm font-semibold">Private Spotting History</h3>
            <p class="max-w-sm text-xs text-muted-foreground">
              This user has opted to hide their historical spotting data.
            </p>
          </div>
        } @else if (canViewSpottings()) {
          @if (_events().length === 0 && _isLoading()) {
            <p class="text-muted-foreground text-sm">Loading your spottings…</p>
          } @else if (_events().length === 0) {
            <p class="text-muted-foreground text-sm">No spottings logged yet.</p>
          } @else {
            <div class="flex flex-col divide-y">
              @for (group of _groups(); track group.date) {
                <div class="flex flex-col gap-1.5 py-3">
                  <span class="text-sm font-medium">{{ group.date | date }}</span>
                  <ul class="flex flex-col gap-1.5">
                    @for (event of group.events; track event.id) {
                      <li class="flex items-center justify-between gap-2">
                        <div class="flex flex-wrap items-center gap-2">
                          <spotting-type-badge [type]="event.type" />
                          <span class="text-muted-foreground text-xs">
                            {{ event.vehicle.identificationNo }} ({{
                              event.vehicle.vehicleType.internalName
                            }}) — {{ event.vehicle.lines.map((l) => l.code).join(", ") }}
                          </span>
                          @if (event.notes) {
                            <span
                              class="relative inline-flex"
                              (mouseenter)="_tooltipEventId.set(event.id)"
                              (mouseleave)="_tooltipEventId.set(null)"
                            >
                              <button
                                type="button"
                                class="text-muted-foreground hover:text-foreground inline-flex size-5 items-center justify-center rounded outline-none focus-visible:ring-2"
                                aria-label="View notes"
                                (focus)="_tooltipEventId.set(event.id)"
                                (blur)="_tooltipEventId.set(null)"
                                (click)="onNotesClick(event)"
                              >
                                <svg
                                  viewBox="0 0 24 24"
                                  class="size-4"
                                  fill="none"
                                  stroke="currentColor"
                                  stroke-width="2"
                                  aria-hidden="true"
                                >
                                  <rect x="4.5" y="3.5" width="15" height="17" rx="1.5" />
                                  <path stroke-linecap="round" d="M8 8h8M8 12h8M8 16h5" />
                                </svg>
                              </button>
                              @if (_hoverCapable() && _tooltipEventId() === event.id) {
                                <div
                                  class="bg-popover text-popover-foreground border-border absolute top-full left-0 z-20 mt-1.5 w-64 rounded-lg border p-2 text-left text-xs font-normal whitespace-normal shadow-md"
                                >
                                  {{ event.notes }}
                                </div>
                              }
                            </span>
                          }
                        </div>
                        <div class="flex items-center gap-2">
                          <vehicle-status-badge [status]="event.status" />
                          @if (_canDelete(event)) {
                            <button
                              hlmBtn
                              size="icon-sm"
                              variant="ghost"
                              [disabled]="_deletingId() === event.id"
                              (click)="deleteEvent(event.id)"
                              title="Delete"
                            >
                              🗑
                            </button>
                          }
                        </div>
                      </li>
                    }
                  </ul>
                </div>
              }
            </div>

            @if (isOwnProfile() && _hasMore()) {
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
        }
      </div>
    </div>

    <hlm-sheet
      [open]="_modalEvent() !== null"
      (openChange)="onModalOpenChange($event)"
      side="bottom"
    >
      @if (_modalEvent(); as event) {
        <div hlmSheetHeader>
          <h3 class="text-base font-semibold">Notes — {{ event.spottingDate | date }}</h3>
        </div>
        <div hlmSheetBody>
          <p class="text-sm whitespace-pre-wrap">{{ event.notes }}</p>
        </div>
      }
    </hlm-sheet>
  `,
})
export class MySpottingsComponent {
  readonly user = input.required<PublicUserData>();
  readonly isOwnProfile = input.required<boolean>();

  protected readonly showPrivacyMessage = computed(
    () => !this.isOwnProfile() && this.user().spottings === null,
  );

  protected readonly canViewSpottings = computed(
    () => this.isOwnProfile() || this.user().spottings !== null,
  );

  protected readonly spottingsData = computed<MyEvent[]>(() => {
    if (this.canViewSpottings() && this.user().spottings) {
      return this.user().spottings!;
    }
    return [];
  });

  /** The owner's history, fetched here page by page. The parent deliberately passes
   * `spottings: null` for the owner (GET_USER_DATA_QUERY doesn't return them), so unlike the
   * public path below there is nothing to inherit — this component is the fetcher. */
  private readonly _ownEvents = signal<MyEvent[]>([]);
  protected readonly _isLoading = signal(false);
  protected readonly _hasMore = signal(false);

  private readonly graphql = inject(GraphQLClient);
  private readonly auth = inject(AuthService);
  private readonly recaptcha = inject(RecaptchaService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  /** Firebase-id-token requests only exist in the browser; on the server `auth.idToken()`
   * resolves null and an unauthenticated `onlyMine` query would just fail. */
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly _events = computed<MyEvent[]>(() =>
    this.isOwnProfile() ? this._ownEvents() : this.spottingsData(),
  );
  protected readonly _deletingId = signal<string | null>(null);

  protected readonly _groups = computed<EventDayGroup[]>(() => {
    const groups = new Map<string, MyEvent[]>();
    for (const event of this._events() ?? []) {
      const existing = groups.get(event.spottingDate);
      if (existing) {
        existing.push(event);
      } else {
        groups.set(event.spottingDate, [event]);
      }
    }
    return [...groups].map(([date, events]) => ({ date, events }));
  });

  /** Which event's notes popup is showing, if any — shared between the desktop tooltip and the
   * mobile modal's trigger, though only one of the two ever actually renders per `_hoverCapable`. */
  protected readonly _tooltipEventId = signal<string | null>(null);
  protected readonly _modalEvent = signal<MyEvent | null>(null);
  /** Set on destroy so an in-flight loadMore() doesn't write into a dead component. */
  private isDestroyed = false;
  /** Real input capability, not a screen-size guess — a `(hover: hover)` device gets a hover
   * tooltip; anything else (touch, with no reliable hover) gets a tap-to-open modal instead.
   * Defaults to `false` (modal) until measured client-side: that's the safe default, since a
   * touch device stuck defaulting to "hover" would have no working affordance at all, whereas
   * a desktop briefly defaulting to "modal" before this resolves still works fine on click. */
  protected readonly _hoverCapable = signal(false);

  constructor() {
    afterNextRender(() => {
      this._hoverCapable.set(window.matchMedia("(hover: hover) and (pointer: fine)").matches);
    });
    this.destroyRef.onDestroy(() => (this.isDestroyed = true));

    // Own profiles self-fetch their history here. The effect's only dependency is
    // isOwnProfile(), so loadMore() runs untracked — reading/writing _ownEvents reactively
    // would re-trigger this effect on every appended page (same trap as the vehicle-detail
    // spotting history).
    effect(() => {
      if (this.isOwnProfile()) {
        untracked(() => void this.loadMore());
      }
    });
  }

  async loadMore(): Promise<void> {
    if (!this.isBrowser || this._isLoading()) {
      return;
    }
    this._isLoading.set(true);
    try {
      const idToken = await this.auth.idToken();
      if (this.isDestroyed) {
        return;
      }
      const data = await this.graphql.request<GetMyEventsData, GetMyEventsVars>(
        GET_MY_EVENTS_QUERY,
        { limit: PAGE_SIZE, offset: untracked(() => this._ownEvents().length) },
        idToken ? { "firebase-auth-key": idToken } : {},
      );
      if (this.isDestroyed) {
        return;
      }
      this._hasMore.set(data.events.length === PAGE_SIZE);
      this._ownEvents.update((list) => [...list, ...data.events]);
    } catch (err) {
      this.toast.error(
        "Couldn't load spottings",
        err instanceof Error ? err.message : "Unknown error",
      );
    } finally {
      this._isLoading.set(false);
    }
  }

  protected _canDelete(event: MyEvent): boolean {
    return Date.now() - new Date(event.created).getTime() <= DELETE_WINDOW_MS;
  }

  protected onNotesClick(event: MyEvent): void {
    if (this._hoverCapable()) {
      this._tooltipEventId.set(event.id);
    } else {
      this._modalEvent.set(event);
    }
  }

  protected onModalOpenChange(isOpen: boolean): void {
    if (!isOpen) {
      this._modalEvent.set(null);
    }
  }

  async deleteEvent(eventId: string): Promise<void> {
    if (!confirm("Delete this spotting entry? This can't be undone.")) {
      return;
    }
    this._deletingId.set(eventId);
    try {
      const [captchaToken, idToken] = await Promise.all([
        this.recaptcha.execute("deleteSpottingEntry"),
        this.auth.idToken(),
      ]);
      const data = await this.graphql.request<DeleteEventData, DeleteEventVars>(
        DELETE_EVENT_MUTATION,
        { deleteEventInput: { id: eventId } },
        {
          "g-recaptcha-response": captchaToken,
          ...(idToken ? { "firebase-auth-key": idToken } : {}),
        },
      );
      if (data.deleteEvent.ok) {
        this.toast.success(`Deletion of spotting entry #${eventId} successful.`);
      } else {
        this.toast.error("Unknown error on deletion", "Please refresh the page and try again.");
      }
    } catch (err) {
      this.toast.error("Couldn't delete", err instanceof Error ? err.message : "Unknown error");
    } finally {
      this._deletingId.set(null);
    }
  }
}
