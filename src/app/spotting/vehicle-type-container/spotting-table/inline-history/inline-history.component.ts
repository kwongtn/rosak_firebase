import { Apollo, gql } from "apollo-angular";
import { TableWidthConfig } from "ng-devui";
import { Subscription } from "rxjs";
import {
    GetVehiclesLastSpottingResponse,
    LastSpottingsTableElement,
} from "src/app/models/query/get-vehicles";

import { Component, Input, OnDestroy, OnInit } from "@angular/core";

const GET_VEHICLE_LAST_SPOTTINGS = gql`
    query (
        $eventFilters: EventFilter
        $eventPagination: OffsetPaginationInput
        $eventOrder: EventOrder
    ) {
        events(
            filters: $eventFilters
            pagination: $eventPagination
            order: $eventOrder
        ) {
            spottingDate
            status
            type
            notes
            location {
                accuracy
                altitudeAccuracy
                heading
                speed
                location
                altitude
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

    // Pagination
    limit = 30;
    offset = 0;

    showLoading: boolean = true;
    querySubscription!: Subscription;

    dataSource: LastSpottingsTableElement[] = [];

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
                    eventFilters: {
                        vehicleId: this.vehicleId,
                    },
                    eventPagination: {
                        limit: this.limit,
                        offset: this.offset,
                    },
                    eventOrder: {
                        spottingDate: "DESC",
                    },
                },
            })
            .subscribe(({ data, loading }) => {
                this.showLoading = false;
                this.dataSource = data.events.map((val) => {
                    const returnObj: any = {
                        ...val,
                    };

                    if (val.location) {
                        returnObj.location = {
                            ...val.location,
                            latitude: val.location.location[1],
                            longitude: val.location.location[0],
                        };
                    }

                    return returnObj;
                });
            });
    }

    ngOnDestroy() {
        this.querySubscription.unsubscribe();
    }
}
