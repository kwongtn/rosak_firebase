
import { Component, OnInit } from "@angular/core";

import { GtfsStateService } from "./services/gtfs-state.service";

@Component({
    selector: "app-tracker",
    templateUrl: "./tracker.component.html",
    styleUrl: "./tracker.component.scss",
})
export class TrackerComponent implements OnInit {
    constructor(private gtfsStateService: GtfsStateService) {
        this.gtfsStateService.setSourceUrl(
            "https://api.data.gov.my/gtfs-realtime/vehicle-position/ktmb/"
        );
    }

    async ngOnInit() {
        setInterval(() => {
            this.gtfsStateService.refreshGtfsData();
        }, 30000);

        this.gtfsStateService.refreshGtfsData();
    }
}
