import { VehicleStatus } from "src/app/models/query/get-vehicles";
import {
    VehicleStatus as SpottingVehicleStatus
} from "src/app/spotting/spotting-form/spotting-form.types";

import { Component, Input, OnInit } from "@angular/core";

@Component({
    selector: "vehicle-status-tag",
    templateUrl: "./vehicle-status-tag.component.html",
    styleUrls: ["./vehicle-status-tag.component.scss"],
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
