import { TableWidthConfig } from "ng-devui/data-table";
import { VehicleStatus } from "src/app/models/query/get-vehicles";
import { TableDataType } from "src/app/models/spotting-table/source-type";

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

    tagList = {
        inService: false,
        notSpotted: false,
        testing: false,
        unknown: false,
        decommissioned: false,
        married: false,
    };

    allowedStatuses: Set<VehicleStatus> = new Set<VehicleStatus>([
        "IN_SERVICE",
        "NOT_SPOTTED",
        "DECOMMISSIONED",
        "TESTING",
        "UNKNOWN",
        "MARRIED",
    ]);

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

    constructor() {
        return;
    }

    ngOnInit() {
        return;
    }

    private markTotalCheckedTrue() {
        this.totalChecked = true;
        this.tagList.inService = false;
        this.tagList.notSpotted = false;
        this.tagList.testing = false;
        this.tagList.unknown = false;
        this.tagList.decommissioned = false;
        this.tagList.married = false;
        [
            "IN_SERVICE",
            "NOT_SPOTTED",
            "DECOMMISSIONED",
            "TESTING",
            "UNKNOWN",
            "MARRIED",
        ].forEach((value) => {
            this.allowedStatuses.add(value as VehicleStatus);
        });
    }

    changeChecked($event: boolean, status: VehicleStatus | "total") {
        if (status === "total") {
            this.markTotalCheckedTrue();
            return;
        } else if (status === "IN_SERVICE") {
            this.tagList.inService = $event;
        } else if (status === "NOT_SPOTTED") {
            this.tagList.notSpotted = $event;
        } else if (status === "TESTING") {
            this.tagList.testing = $event;
        } else if (status === "UNKNOWN") {
            this.tagList.unknown = $event;
        } else if (status === "DECOMMISSIONED") {
            this.tagList.decommissioned = $event;
        } else if (status === "MARRIED") {
            this.tagList.married = $event;
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

        this.totalChecked = !Object.values(this.tagList).some((value) => {
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
