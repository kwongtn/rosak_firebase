import { Component, Input, OnInit } from "@angular/core";

type VehicleStatus =
    | "IN_SERVICE"
    | "NOT_SPOTTED"
    | "DECOMMISSIONED"
    | "TESTING"
    | "UNKNOWN";

@Component({
    selector: "vehicle-status-tag",
    templateUrl: "./vehicle-status-tag.component.html",
    styleUrls: ["./vehicle-status-tag.component.scss"],
})
export class VehicleStatusTagComponent implements OnInit {
    @Input() vehicleStatus!: VehicleStatus;

    constructor() {
        return;
    }

    ngOnInit(): void {
        return;
    }
}
