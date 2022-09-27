import { TableWidthConfig } from "ng-devui";

import { Component, Input, OnInit } from "@angular/core";

import {
    ConsoleEventsGqlResponseElement,
} from "../services/events-gql/events-gql.service";

@Component({
    selector: "console-events-table",
    templateUrl: "./events-table.component.html",
    styleUrls: ["./events-table.component.scss"],
})
export class ConsoleEventsTableComponent implements OnInit {
    @Input() dataSource!: ConsoleEventsGqlResponseElement[];

    dataTableOptions = {
        columns: [
            {
                field: "id",
                header: "Event ID",
                fieldType: "id",
                order: 1,
            },
            {
                field: "created",
                header: "Created",
                fieldType: "datetime",
                order: 2,
            },
            {
                field: "status",
                header: "Status",
                fieldType: "status",
                order: 3,
            },
            {
                field: "spottingDate",
                header: "Date",
                fieldType: "text",
                order: 4,
            },
            {
                field: "type",
                header: "Spotting Type",
                fieldType: "text",
                order: 5,
            },
            {
                field: "vehicle",
                header: "Vehicle",
                fieldType: "vehicle",
                order: 6,
            },
            {
                field: "notes",
                header: "Notes",
                fieldType: "text",
                order: 7,
            },
        ],
    };

    tableWidthConfig: TableWidthConfig[] = [
        { field: "id", width: "100px" },
        { field: "created", width: "150px" },
        { field: "status", width: "150px" },
        { field: "spottingDate", width: "150px" },
        { field: "type", width: "150px" },
        { field: "vehicle", width: "250px" },
        { field: "notes", width: "500px" },
    ];

    constructor() {
        return;
    }

    ngOnInit(): void {
        return;
    }
}
