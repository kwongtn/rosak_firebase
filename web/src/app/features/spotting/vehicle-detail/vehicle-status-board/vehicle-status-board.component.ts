import { Component, input } from "@angular/core";
import { DatePipe } from "@angular/common";
import { HlmCardImports } from "../../../../ui/card/card";
import { VehicleRow } from "../../data/spotting.queries";
import { humanizeSince } from "../../data/humanize-since.util";

/**
 * At-a-glance stats for one vehicle — spotting frequency and service history, complementing the
 * status/wheel badges already shown in the page header rather than repeating them.
 */
@Component({
    selector: "app-vehicle-status-board",
    imports: [DatePipe, ...HlmCardImports],
    template: `
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div hlmCard>
                <div hlmCardContent>
                    <p class="text-muted-foreground text-xs">Times Spotted</p>
                    <p class="text-lg font-semibold">{{ vehicle().spottingCount }}</p>
                </div>
            </div>
            <div hlmCard>
                <div hlmCardContent>
                    <p class="text-muted-foreground text-xs">Last Spotted</p>
                    @if (vehicle().lastSpottingDate; as date) {
                        <p class="text-lg font-semibold">{{ date | date }}</p>
                        <p class="text-muted-foreground text-xs">{{ _humanizeSince(date) }}</p>
                    } @else {
                        <p class="text-lg font-semibold">Never</p>
                    }
                </div>
            </div>
            <div hlmCard>
                <div hlmCardContent>
                    <p class="text-muted-foreground text-xs">In Service Since</p>
                    @if (vehicle().inServiceSince; as date) {
                        <p class="text-lg font-semibold">{{ date | date }}</p>
                        <p class="text-muted-foreground text-xs">{{ _humanizeSince(date) }}</p>
                    } @else {
                        <p class="text-lg font-semibold">—</p>
                    }
                </div>
            </div>
            <div hlmCard>
                <div hlmCardContent>
                    <p class="text-muted-foreground text-xs">Incidents Logged</p>
                    <p class="text-lg font-semibold">{{ vehicle().incidentCount }}</p>
                </div>
            </div>
        </div>
    `,
})
export class VehicleStatusBoardComponent {
    readonly vehicle = input.required<VehicleRow>();

    protected readonly _humanizeSince = humanizeSince;
}
