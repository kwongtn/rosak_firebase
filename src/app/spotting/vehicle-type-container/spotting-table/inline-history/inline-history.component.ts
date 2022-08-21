import { Apollo, gql } from "apollo-angular";
import { TableWidthConfig } from "ng-devui";
import { Subscription } from "rxjs";
import {
    GetVehiclesLastSpottingResponse,
    LastSpottings,
} from "src/app/models/query/get-vehicles";

import { Component, Input, OnDestroy, OnInit } from "@angular/core";

const GET_VEHICLE_LAST_SPOTTINGS = gql`
    query ($filters: VehicleFilter, $lastSpottingCount: Int) {
        vehicles(filters: $filters) {
            lastSpottings(count: $lastSpottingCount) {
                spottingDate
                status
                type
                notes
            }
        }
    }
`;

@Component({
    selector: "app-inline-history",
    templateUrl: "./inline-history.component.html",
    styleUrls: ["./inline-history.component.scss"],
})
export class InlineHistoryComponent implements OnInit, OnDestroy {
    @Input() vehicleId!: string | number;

    showLoading: boolean = true;
    private querySubscription!: Subscription;

    dataSource: LastSpottings[] = [];

    dataTableOptions = {
        columns: [
            {
                field: "spottingDate",
                header: "Spotting Date",
                fieldType: "date",
                order: 1,
            },
            {
                field: "status",
                header: "Status",
                fieldType: "status",
                order: 2,
            },
            {
                field: "type",
                header: "Type",
                fieldType: "type",
                order: 3,
            },
            {
                field: "notes",
                header: "Notes",
                fieldType: "text",
                order: 4,
            },
        ],
    };

    tableWidthConfig: TableWidthConfig[] = [
        { field: "spottingDate", width: "100px" },
        { field: "status", width: "150px" },
        { field: "type", width: "150px" },
        { field: "notes", width: "500px" },
    ];

    constructor(private apollo: Apollo) {
        return;
    }

    ngOnInit(): void {
        this.querySubscription = this.apollo
            .query<GetVehiclesLastSpottingResponse>({
                query: GET_VEHICLE_LAST_SPOTTINGS,
                variables: {
                    filters: {
                        id: this.vehicleId,
                    },
                    lastSpottingCount: 5,
                },
            })
            .subscribe(({ data, loading }) => {
                this.showLoading = false;
                this.dataSource = data.vehicles[0].lastSpottings;
            });
    }

    ngOnDestroy() {
        this.querySubscription.unsubscribe();
    }
}
