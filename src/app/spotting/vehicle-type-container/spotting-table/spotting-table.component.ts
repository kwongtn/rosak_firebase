import { TableWidthConfig } from "ng-devui/data-table";
import { TableDataType } from "src/app/models/spotting-table/source-type";
import {
    tagListDisplayConfig,
    TagListDisplayConfig,
    vehicleStatus,
    VehicleStatus
} from "src/app/spotting/utils";

import { Component, Input, OnInit } from "@angular/core";

@Component({
    selector: "app-spotting-table",
    templateUrl: "./spotting-table.component.html",
    styleUrls: ["./spotting-table.component.scss"],
})
export class SpottingTableComponent implements OnInit {
    @Input() dataSource!: TableDataType;

    displayData: TableDataType[] = [];
    isCollapsed: boolean = !false;

    allowedStatuses: Set<VehicleStatus> = new Set<VehicleStatus>(vehicleStatus);

    totalChecked: boolean = true;

    dataTableOptions = {
        columns: [
            {
                field: "identificationNo",
                header: "Vehicle ID",
                fieldType: "id",
                order: 1,
            },
            {
                field: "status",
                header: "Status",
                fieldType: "status",
                order: 2,
            },
            {
                field: "lastSpotted",
                header: "Last Spotted",
                fieldType: "text",
                order: 3,
            },
            {
                field: "inServiceSince",
                header: "In Service Since",
                fieldType: "date",
                order: 4,
            },
            // {
            //     field: "lastSpottedBy",
            //     header: "Last Spotted By",
            //     fieldType: "text",
            //     order: 5,
            // },
            {
                field: "timesSpotted",
                header: "Times Spotted",
                fieldType: "number",
                order: 5,
            },
            {
                field: "notes",
                header: "Notes",
                fieldType: "text",
                order: 6,
            },
        ],
    };

    tableWidthConfig: TableWidthConfig[] = [
        { field: "", width: "30px" },
        { field: "identificationNo", width: "100px" },
        { field: "status", width: "150px" },
        { field: "lastSpotted", width: "150px" },
        { field: "inServiceSince", width: "150px" },
        // { field: "lastSpottedBy", width: "100px", },
        { field: "timesSpotted", width: "150px" },
        { field: "notes", width: "500px" },
    ];

    tagListDisplayConfig: TagListDisplayConfig[] = JSON.parse(
        JSON.stringify(tagListDisplayConfig)
    );

    constructor() {
        return;
    }

    ngOnInit() {
        return;
    }

    private markTotalCheckedTrue() {
        this.totalChecked = true;
        this.tagListDisplayConfig.forEach((val) => {
            val.checked = false;
        });

        vehicleStatus.forEach((value) => {
            this.allowedStatuses.add(value as VehicleStatus);
        });
    }

    changeChecked($event: boolean, status: VehicleStatus | "total") {
        if (status === "total") {
            this.markTotalCheckedTrue();
            return;
        } else if (vehicleStatus.includes(status)) {
            this.tagListDisplayConfig.forEach((val) => {
                if (status === val.status) {
                    val.checked = $event;
                }
            });
        } else {
            console.error("Unknown status type: " + status);
        }

        if (this.totalChecked == true) {
            this.allowedStatuses.clear();
        }

        if ($event) {
            this.allowedStatuses.add(status);
        } else {
            this.allowedStatuses.delete(status);
        }

        this.totalChecked = !Object.values(
            this.tagListDisplayConfig.map((val) => {
                return val.checked;
            })
        ).some((value) => {
            return value;
        });

        if (this.totalChecked == true) {
            this.markTotalCheckedTrue();
        }
    }

    toggleExpand(rowItem: any) {
        console.log(rowItem);
        if (rowItem.$expandConfig && rowItem.$expandConfig.expandable) {
            rowItem.$expandConfig.expand = !rowItem.$expandConfig.expand;
        }
    }

    toggle($event: any) {
        this.isCollapsed = $event;
    }
}
