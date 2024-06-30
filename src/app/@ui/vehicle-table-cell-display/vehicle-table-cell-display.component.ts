import { TooltipModule } from "ng-devui";
import {
    VehicleStatus,
} from "src/app/pipes/vehicle-status/vehicle-status.pipe";
import { environment } from "src/environments/environment";

import { CommonModule } from "@angular/common";
import { Component, Input, OnInit } from "@angular/core";

import {
    VehicleStatusTagComponent,
} from "../vehicle-status-tag/vehicle-status-tag.component";

interface VehicleData {
    id: string;
    status: VehicleStatus;
    identificationNo: string;
    notes: string;
    vehicleType: {
        internalName: string;
    };
    lines: [
        {
            code: string;
        },
    ];
}

@Component({
    selector: "vehicle-table-cell-display",
    templateUrl: "./vehicle-table-cell-display.component.html",
    styleUrls: ["./vehicle-table-cell-display.component.scss"],
    standalone: true,
    imports: [CommonModule, TooltipModule, VehicleStatusTagComponent],
})
export class VehicleTableCellDisplayComponent implements OnInit {
    @Input() vehicleData!: VehicleData;
    lines: string = "";

    backendUrl: string = environment.backendUrl;

    constructor() {
        return;
    }

    ngOnInit(): void {
        this.lines = this.vehicleData.lines
            .map((line) => {
                return line.code;
            })
            .join(", ");
    }
}
