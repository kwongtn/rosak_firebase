import { NzCollapseModule } from "ng-zorro-antd/collapse";
import { NzIconModule } from "ng-zorro-antd/icon";
import { NzTableModule } from "ng-zorro-antd/table";
import { NzTagModule } from "ng-zorro-antd/tag";
import { NzToolTipModule } from "ng-zorro-antd/tooltip";
import {
    VehicleStatusTagComponent,
} from "src/app/@ui/vehicle-status-tag/vehicle-status-tag.component";
import {
    WheelStatusTagComponent,
} from "src/app/@ui/wheel-status-tag/wheel-status-tag.component";
import { TableDataType } from "src/app/models/spotting-table/source-type";
import {
    TagListDisplayConfig,
    tagListDisplayConfig,
    VehicleStatus,
    vehicleStatus,
} from "src/app/spotting/utils";

import { CommonModule } from "@angular/common";
import { Component, Input, OnInit } from "@angular/core";

import {
    InlineHistoryComponent,
} from "./inline-history/inline-history.component";
import {
    InlineTimelineComponent,
} from "./inline-timeline/inline-timeline.component";

interface TableWidthConfig {
    field: string;
    width: string;
}

@Component({
    selector: "app-spotting-table",
    templateUrl: "./spotting-table.component.html",
    styleUrls: ["./spotting-table.component.scss"],
    standalone: true,
    imports: [
        CommonModule,
        InlineHistoryComponent,
        InlineTimelineComponent,
        NzCollapseModule,
        NzIconModule,
        NzTableModule,
        NzTagModule,
        NzToolTipModule,
        VehicleStatusTagComponent,
        WheelStatusTagComponent,
    ],
})
export class SpottingTableComponent implements OnInit {
    @Input() dataSource!: TableDataType;

    // SourceType doesn't declare every field actually present on row data (e.g. nickname,
    // incidentCount, wheelStatus) - exposed as `any[]` here so the table template can read
    // them, matching how the previous data-table's untyped row template context worked.
    get tableRows(): any[] {
        return this.dataSource.tableData;
    }

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
                field: "wheelStatus",
                header: "Wheel Status",
                fieldType: "wheelStatus",
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
        { field: "", width: "30px" },
        { field: "identificationNo", width: "100px" },
        { field: "status", width: "150px" },
        { field: "lastSpotted", width: "150px" },
        { field: "inServiceSince", width: "150px" },
        // { field: "lastSpottedBy", width: "100px", },
        { field: "timesSpotted", width: "150px" },
        { field: "wheelStatus", width: "100px" },
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

    widthFor(field: string): string {
        return this.tableWidthConfig.find((c) => c.field === field)?.width ?? "";
    }
}
