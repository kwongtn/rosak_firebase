import { TableWidthConfig } from "ng-devui/data-table";
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

    tagList = {
        inService: false,
        notSpotted: false,
        testing: false,
        unknown: false,
        decommissioned: false,
        married: false,
    };

    totalChecked: boolean = true;

    dataTableOptions = {
        columns: [
            {
                field: "identificationNo",
                header: "Vehicle ID",
                fieldType: "text",
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

    changeChecked($event: boolean, status: string) {
        if (status === "total") {
            this.totalChecked = true;
            this.tagList.inService = false;
            this.tagList.notSpotted = false;
            this.tagList.testing = false;
            this.tagList.unknown = false;
            this.tagList.decommissioned = false;
            this.tagList.married = false;
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

        this.totalChecked = !Object.values(this.tagList).some((value) => {
            return value;
        });

        // console.log($event, status);
        // console.log(this.tagList);
        console.log(this.displayData);
    }
}
