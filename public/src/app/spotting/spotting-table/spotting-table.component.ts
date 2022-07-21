import { TableWidthConfig } from "ng-devui/data-table";

import { Component, Input, OnInit } from "@angular/core";

import { SourceType } from "../../models/spotting-table/source-type";

@Component({
    selector: "app-spotting-table",
    templateUrl: "./spotting-table.component.html",
    styleUrls: ["./spotting-table.component.scss"],
})
export class SpottingTableComponent implements OnInit {
    @Input() dataSource: Array<SourceType> = [];
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
        // { field: "notes", width: "50px", },
    ];

    constructor() {
        return;
    }

    ngOnInit() {
        return;
    }
}
