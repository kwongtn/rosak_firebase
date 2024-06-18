import { NzGridModule } from "ng-zorro-antd/grid";

import { CommonModule } from "@angular/common";
import { Component, OnDestroy, OnInit } from "@angular/core";

import { TrackerMapComponent } from "./map/map.component";
import { GtfsRtStateService } from "./services/gtfs-rt-state.service";
import { StatusCardComponent } from "./status-card/status-card.component";

@Component({
    selector: "app-tracker",
    templateUrl: "./tracker.component.html",
    styleUrl: "./tracker.component.scss",
    standalone: true,
    imports: [
        CommonModule,
        NzGridModule,
        TrackerMapComponent,
        StatusCardComponent,
    ],
})
export class TrackerComponent implements OnInit, OnDestroy {
    constructor(private gtfsRtStateService: GtfsRtStateService) {}

    async ngOnInit() {
        // this.gtfsRtStateService.startAllIntervalRefresh(30000);
    }

    ngOnDestroy() {
        // this.gtfsRtStateService.stopAllIntervalRefresh();
    }
}
