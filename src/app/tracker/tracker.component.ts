import { Component, OnDestroy, OnInit } from "@angular/core";

import { GtfsStateService } from "./services/gtfs-state.service";

@Component({
    selector: "app-tracker",
    templateUrl: "./tracker.component.html",
    styleUrl: "./tracker.component.scss",
})
export class TrackerComponent implements OnInit, OnDestroy {
    constructor(private gtfsStateService: GtfsStateService) {
        this.gtfsStateService.addSourceUrl({
            name: "ktmb",
            sourceUrl:
                "https://api.data.gov.my/gtfs-realtime/vehicle-position/ktmb/",
            intervalMs: 30000,
        });
    }

    async ngOnInit() {
        this.gtfsStateService.startAllIntervalRefresh(30000);
    }

    ngOnDestroy() {
        this.gtfsStateService.stopAllIntervalRefresh();
    }
}
