import { VehicleStatus } from "src/app/models/query/get-vehicles";
import { environment } from "src/environments/environment";

import { Component, Input, OnInit } from "@angular/core";

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
        }
    ];
}

@Component({
    selector: "vehicle-table-cell-display",
    templateUrl: "./vehicle-table-cell-display.component.html",
    styleUrls: ["./vehicle-table-cell-display.component.scss"],
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
