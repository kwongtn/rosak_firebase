import { TableWidthConfig } from "ng-devui/data-table";
import { VehicleStatusCountType } from "src/app/models/query/get-vehicles";
import { TableDataType } from "src/app/models/spotting-table/source-type";

import { Component, Input, OnInit } from "@angular/core";

const vehicleStatus = [
    "IN_SERVICE",
    "NOT_SPOTTED",
    "OUT_OF_SERVICE",
    "DECOMMISSIONED",
    "TESTING",
    "UNKNOWN",
    "MARRIED",
];

export type VehicleStatus = (typeof vehicleStatus)[number];

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

    tagListDisplayConfig: {
        key: keyof VehicleStatusCountType;
        displayPrefix: string;
        checked: boolean;
        status: VehicleStatus;
        labelStyle?: string;
        customColor?: string;
    }[] = [
            {
                key: "vehicleStatusInServiceCount",
                checked: false,
                displayPrefix: "In Service",
                status: "IN_SERVICE",
                labelStyle: "green-w98",
            },
            {
                key: "vehicleStatusNotSpottedCount",
                checked: false,
                displayPrefix: "Not Spotted",
                status: "NOT_SPOTTED",
                labelStyle: "yellow-w98",
            },
            {
                key: "vehicleStatusOutOfServiceCount",
                checked: false,
                displayPrefix: "Out of Service",
                status: "OUT_OF_SERVICE",
                labelStyle: "red-w98",
            },
            {
                key: "vehicleStatusTestingCount",
                checked: false,
                displayPrefix: "Testing",
                status: "TESTING",
                labelStyle: "blue-w98",
            },
            {
                key: "vehicleStatusUnknownCount",
                checked: false,
                displayPrefix: "Unknown",
                status: "UNKNOWN",
                labelStyle: "red-w98",
            },
            {
                key: "vehicleStatusDecommissionedCount",
                checked: false,
                displayPrefix: "Decommissioned",
                status: "DECOMMISSIONED",
                customColor: "var(--devui-text-weak)",
            },
            {
                key: "vehicleStatusMarriedCount",
                checked: false,
                displayPrefix: "Married",
                status: "MARRIED",
                customColor: "var(--devui-text-weak)",
            },
        ];

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
