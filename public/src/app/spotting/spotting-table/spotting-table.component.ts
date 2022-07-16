import { Component, OnInit } from "@angular/core";

export interface SourceType {
    id?: number;
    firstName: string;
    lastName: string;
    dob: Date;
    gender: string;
    detail?: string;
    $checked?: boolean;
    $expandConfig?: any;
    children?: any;
    chosen?: boolean;
    $isChildTableOpen?: boolean;
}

export const sampleData = [
    {
        identificationNo: "01",
        status: "IN_SERVICE",
        lastSpotted: "2022-07-15",
        lastSpottedBy: undefined,
        notes: "",
    },
];

@Component({
    selector: "app-spotting-table",
    templateUrl: "./spotting-table.component.html",
    styleUrls: ["./spotting-table.component.scss"],
})
export class SpottingTableComponent implements OnInit {
    basicDataSource: Array<SourceType> = JSON.parse(JSON.stringify(sampleData));
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
                fieldType: "text",
                order: 2,
            },
            {
                field: "lastSpotted",
                header: "Last Spotted",
                fieldType: "text",
                order: 3,
            },
            {
                field: "lastSpottedBy",
                header: "Last Spotted By",
                fieldType: "text",
                order: 4,
            },
            {
                field: "notes",
                header: "Notes",
                fieldType: "text",
                order: 5,
            },
            {
                field: "inServiceSince",
                header: "In Service Since",
                fieldType: "text",
                order: 6,
            },
        ],
    };

    constructor() {
        return;
    }

    ngOnInit() {
        return;
    }
}
