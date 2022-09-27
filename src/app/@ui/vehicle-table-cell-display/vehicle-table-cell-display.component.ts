import { VehicleStatus } from "src/app/models/query/get-vehicles";
import { environment } from "src/environments/environment";

import { Component, Input, OnInit } from "@angular/core";

interface VehicleData {
    id: string;
    status: VehicleStatus;
    identificationNo: string;
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

    backendUrl: string = environment.backendUrl;
    cellData: any = undefined;

    constructor() {
        return;
    }

    ngOnInit(): void {
        const lines = this.vehicleData.lines.map((line) => {
            return line.code;
        });

        this.cellData = {
            ...this.vehicleData,
            lines: lines,
        };
    }
}
