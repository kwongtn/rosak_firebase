
import { TagsModule } from "ng-devui";
import {
    VehicleStatus,
    VehicleStatusPipe,
} from "src/app/pipes/vehicle-status/vehicle-status.pipe";
import {
    VehicleStatus as SpottingVehicleStatus,
} from "src/app/spotting/spotting-form/spotting-form.types";

import { Component, Input, OnInit } from "@angular/core";

@Component({
    selector: "vehicle-status-tag",
    templateUrl: "./vehicle-status-tag.component.html",
    styleUrls: ["./vehicle-status-tag.component.scss"],
    standalone: true,
    imports: [
        VehicleStatusPipe, TagsModule
    ]
})
export class VehicleStatusTagComponent implements OnInit {
    @Input() vehicleStatus!: VehicleStatus | SpottingVehicleStatus;

    constructor() {
        return;
    }

    ngOnInit(): void {
        return;
    }
}
