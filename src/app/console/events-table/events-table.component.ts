import { DataTableComponent, TableWidthConfig } from "ng-devui";
import { environment } from "src/environments/environment";

import { Component, Input, OnInit, ViewChild } from "@angular/core";

import {
    ConsoleEventsGqlResponseElement,
} from "../services/events-gql/events-gql.service";
import { MarkReadService } from "../services/mark-read/mark-read.service";

interface TableSourceType extends ConsoleEventsGqlResponseElement {
    $checked?: boolean;
    $checkDisabled?: boolean;
}

@Component({
    selector: "console-events-table",
    templateUrl: "./events-table.component.html",
    styleUrls: ["./events-table.component.scss"],
})
export class ConsoleEventsTableComponent implements OnInit {
    @ViewChild(DataTableComponent, { static: true })
        datatable!: DataTableComponent;
    @Input() dataSource!: ConsoleEventsGqlResponseElement[];
    @Input() showCheckbox: boolean = false;

    checkboxList: any[] = [];
    allChecked: boolean = false;
    halfChecked: boolean = false;
    showLoading: boolean = false;

    backendUrl: string = environment.backendUrl;

    displayData: TableSourceType[] = [];

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
                fieldType: "spottingType",
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

    constructor(private markReadService: MarkReadService) {
        return;
    }

    ngOnInit(): void {
        this.displayData = [...this.dataSource]
            .sort((a, b) => {
                const aDate = new Date(a.created) as any;
                const bDate = new Date(b.created) as any;
                return bDate - aDate;
            })
            .map((val) => {
                return {
                    ...val,
                    $checked: false,
                    $checkDisabled: false,
                };
            });
    }

    markAsRead() {
        this.showLoading = true;
        const rows = this.datatable.getCheckedRows().map((value) => {
            return value.id;
        });

        this.markReadService.markAsRead(rows).then(({ data, loading }) => {
            if (data?.markAsRead.ok) {
                this.displayData = this.displayData.filter((elem) => {
                    return !rows.includes(elem.id);
                });
            }
            this.showLoading = loading;
        });
    }

    onRowCheckChange(
        checked: boolean,
        rowIndex: any,
        nestedIndex: any,
        rowItem: any
    ) {
        rowItem.$checked = checked;
        rowItem.$halfChecked = false;
        this.datatable.setRowCheckStatus({
            rowIndex: rowIndex,
            nestedIndex: nestedIndex,
            rowItem: rowItem,
            checked: checked,
        });
    }
}
