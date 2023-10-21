import { QueryRef } from "apollo-angular";
import { DataTableComponent, TableWidthConfig } from "ng-devui";
import { Subscription } from "rxjs";
import {
    GetVehiclesLastSpottingResponse,
    LastSpottingsTableElement,
} from "src/app/models/query/get-vehicles";
import {
    GetSpottingHistoryService,
} from "src/app/spotting/services/get-spotting-history.service";

import { Component, Input, OnDestroy, OnInit } from "@angular/core";

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
    watchQueryOption!: QueryRef<GetVehiclesLastSpottingResponse>;

    loading: boolean = true;
    querySubscription!: Subscription;

    dataSource: LastSpottingsTableElement[] = [];
    expandConfig: { [key: string]: boolean } = {};

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
                fieldType: "notes",
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

    constructor(private getSpottingHistoryGql: GetSpottingHistoryService) {
        return;
    }

    ngOnInit(): void {
        this.watchQueryOption = this.getSpottingHistoryGql.watch(
            {
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
            {
                fetchPolicy: "network-only",
            }
        );

        this.querySubscription = this.watchQueryOption.valueChanges.subscribe(
            ({ data, loading }) => {
                this.loading = loading;
                this.dataSource = this.mapGqlResultsToDisplayData(data);
                this.expandConfig = this.mapGqlResultsToExpandConfig(data);

                this.offset = this.dataSource.length;
            }
        );
    }

    loadMore($event: DataTableComponent) {
        this.loading = true;

        this.watchQueryOption
            .fetchMore({
                variables: {
                    eventPagination: {
                        limit: this.limit,
                        offset: this.offset,
                    },
                },
            })
            .then(({ data, loading }) => {
                this.dataSource = this.dataSource.concat(
                    this.mapGqlResultsToDisplayData(data)
                );
                this.expandConfig = {
                    ...this.expandConfig,
                    ...this.mapGqlResultsToExpandConfig(data),
                };

                this.loading = loading;
                this.offset = this.dataSource.length;
            });
    }

    mapGqlResultsToDisplayData(data: any) {
        return data.events.map((val: any) => {
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
    }

    mapGqlResultsToExpandConfig(data: any) {
        const returnObj: { [key: string]: boolean } = {};
        data.events.forEach((val: LastSpottingsTableElement) => {
            returnObj[val.id] = false;
        });
        return returnObj;
    }

    onPictureIconClick(eventId: string) {
        this.expandConfig[eventId] = !this.expandConfig[eventId];
    }

    ngOnDestroy() {
        this.querySubscription.unsubscribe();
    }
}
