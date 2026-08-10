import { Component, computed, input } from "@angular/core";
import { DatePipe } from "@angular/common";
import { graphqlResource } from "../../../../core/graphql/graphql-client";
import { IncidentSeverity } from "../../../../core/graphql/types";
import {
    VEHICLE_INCIDENTS_QUERY,
    VehicleIncidentsQueryData,
    VehicleIncidentsQueryVars,
} from "../../data/spotting.queries";

const DOT_CLASS_BY_SEVERITY: Record<IncidentSeverity, string> = {
    CRITICAL: "bg-destructive",
    TRIVIA: "bg-blue-500",
    STATUS: "bg-emerald-500",
};

/** Per-vehicle incident timeline — a plain chronological list rather than the old app's alternating horizontal cards, which don't fit well on a phone screen. */
@Component({
    selector: "app-incident-timeline",
    imports: [DatePipe],
    template: `
        @if (resource.isLoading()) {
            <p class="text-muted-foreground text-sm">Loading…</p>
        } @else if (_incidents().length > 0) {
            <ol class="flex flex-col gap-3">
                @for (incident of _incidents(); track incident.order) {
                    <li class="flex gap-3">
                        <span class="mt-1.5 size-2 shrink-0 rounded-full" [class]="_dotClass(incident.severity)"></span>
                        <div>
                            <div class="flex items-baseline gap-2">
                                <span class="text-sm font-medium">{{ incident.title }}</span>
                                <span class="text-muted-foreground text-xs">{{ incident.date | date }}</span>
                            </div>
                            <p class="text-muted-foreground text-sm">{{ incident.brief }}</p>
                        </div>
                    </li>
                }
            </ol>
        } @else {
            <p class="text-muted-foreground text-sm">No record</p>
        }
    `,
})
export class IncidentTimelineComponent {
    readonly vehicleId = input.required<string>();

    protected readonly resource = graphqlResource<VehicleIncidentsQueryData, VehicleIncidentsQueryVars>(() => ({
        query: VEHICLE_INCIDENTS_QUERY,
        variables: { vehicleId: this.vehicleId() },
    }));

    protected readonly _incidents = computed(() =>
        [...(this.resource.data()?.vehicleIncidents ?? [])].sort((a, b) => a.order - b.order)
    );

    protected _dotClass(severity: IncidentSeverity): string {
        return DOT_CLASS_BY_SEVERITY[severity];
    }
}
