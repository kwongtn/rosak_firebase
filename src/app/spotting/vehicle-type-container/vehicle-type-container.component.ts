import { TableDataType } from "src/app/models/spotting-table/source-type";

import { Component, Input, OnInit } from "@angular/core";

@Component({
    selector: "app-vehicle-type-container",
    templateUrl: "./vehicle-type-container.component.html",
    styleUrls: ["./vehicle-type-container.component.scss"],
})
export class VehicleTypeContainerComponent implements OnInit {
    @Input() tableData!: TableDataType[];

    constructor() {
        return;
    }

    ngOnInit(): void {
        return;
    }
}
