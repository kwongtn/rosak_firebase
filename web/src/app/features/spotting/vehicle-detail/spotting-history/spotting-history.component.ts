import { Component, computed, effect, inject, input, signal, untracked } from "@angular/core";
import { DatePipe } from "@angular/common";
import { GraphQLClient } from "../../../../core/graphql/graphql-client";
import { HlmButton } from "../../../../ui/button/button";
import { HlmSkeleton } from "../../../../ui/skeleton/skeleton";
import { VehicleStatusBadge } from "../../../../domain-ui/vehicle-status-badge/vehicle-status-badge";
import { SpottingTypeBadge } from "../../../../domain-ui/spotting-type-badge/spotting-type-badge";
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
 */
@Component({
    selector: "app-spotting-history",
    imports: [DatePipe, HlmButton, HlmSkeleton, VehicleStatusBadge, SpottingTypeBadge],
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
                        <h4 class="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">
                            {{ group.events[0].spottingDate | date: "MMMM y" }}
                        </h4>
                        <ul class="flex flex-col">
                            @for (event of group.events; track event.id) {
                                <li class="flex flex-col gap-1.5 py-1.5">
                                    <div class="flex flex-wrap items-center justify-between gap-2">
                                        <div class="flex flex-wrap items-center gap-2">
                                            <span class="text-sm font-medium">{{ event.spottingDate | date }}</span>
                                            <spotting-type-badge [type]="event.type" />
                                            @if (event.originStation) {
                                                <span class="text-muted-foreground text-xs">
                                                    {{ event.originStation.displayName }}
                                                    @if (event.destinationStation) {
                                                        → {{ event.destinationStation.displayName }}
                                                    }
                                                </span>
                                            }
                                        </div>
                                        <vehicle-status-badge [status]="event.status" />
                                    </div>
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
                <button hlmBtn variant="outline" size="sm" class="mt-4" [disabled]="_isLoading()" (click)="loadMore()">
                    {{ _isLoading() ? "Loading…" : "Load more" }}
                </button>
            }
        }
    `,
})
export class SpottingHistoryComponent {
    readonly vehicleId = input.required<string>();

    private readonly graphql = inject(GraphQLClient);

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
        // Everything below must run untracked: this effect's only real dependency is
        // vehicleId() — reading _eventsByVehicle/_events here (even transitively, via
        // loadMore()) would make the effect re-run every time loadMore() itself writes new
        // results, wiping them out and re-fetching forever.
        effect(() => {
            const vehicleId = this.vehicleId();
            untracked(() => {
                this._hasMore.set(true);
                this._eventsByVehicle.update((map) => {
                    const next = new Map(map);
                    next.delete(vehicleId);
                    return next;
                });
                this.loadMore();
            });
        });
    }

    async loadMore(): Promise<void> {
        const vehicleId = this.vehicleId();
        this._isLoading.set(true);
        try {
            const data = await this.graphql.request<VehicleEventsQueryData, VehicleEventsQueryVars>(
                VEHICLE_EVENTS_QUERY,
                { vehicleId, limit: PAGE_SIZE, offset: untracked(() => this._events().length) }
            );
            this._hasMore.set(data.events.length === PAGE_SIZE);
            this._eventsByVehicle.update((map) => {
                const next = new Map(map);
                next.set(vehicleId, [...(next.get(vehicleId) ?? []), ...data.events]);
                return next;
            });
        } finally {
            this._isLoading.set(false);
        }
    }
}
