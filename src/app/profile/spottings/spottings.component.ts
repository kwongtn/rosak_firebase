import { QueryRef } from "apollo-angular";
import { DataTableComponent, TableWidthConfig } from "ng-devui";
import { Subscription } from "rxjs";
import {
    ConsoleEventsGqlResponseTableDataElement,
} from "src/app/console/services/events-gql/events-gql.service";
import { AuthService } from "src/app/services/auth/auth.service";
import { environment } from "src/environments/environment";

import {
    AfterViewInit,
    Component,
    OnDestroy,
    OnInit,
    ViewChild,
} from "@angular/core";

import { GetEventsService } from "../services/get-events.service";

@Component({
    selector: "profile-spottings",
    templateUrl: "./spottings.component.html",
    styleUrls: ["./spottings.component.scss"],
})
export class ProfileSpottingsComponent
implements OnInit, OnDestroy, AfterViewInit
{
    @ViewChild("tableInstance") tableInstance!: DataTableComponent;
    private mainQuerySubscription!: Subscription;
    loading = true;

    // Pagination
    limit = 30;
    offset = 0;

    displayData: ConsoleEventsGqlResponseTableDataElement[] = [];

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

    backendUrl: string = environment.backendUrl;

    tableWidthConfig: TableWidthConfig[] = [
        { field: "id", width: "100px" },
        { field: "created", width: "150px" },
        { field: "status", width: "150px" },
        { field: "spottingDate", width: "150px" },
        { field: "type", width: "150px" },
        { field: "vehicle", width: "250px" },
        { field: "notes", width: "500px" },
    ];

    watchQueryOption!: QueryRef<any>;

    constructor(
        private getEventsGql: GetEventsService,
        public authService: AuthService
    ) {}

    async ngOnInit() {
        const authKey = await this.authService.getIdToken();

        this.watchQueryOption = this.getEventsGql.watch(
            {
                eventFilters: {
                    onlyMine: true,
                },
                eventOrder: {
                    created: "DESC",
                },
                eventPagination: {
                    limit: this.limit,
                    offset: this.offset,
                },
            },
            {
                context: {
                    headers: {
                        "firebase-auth-key": authKey,
                    },
                },
                fetchPolicy: "network-only",
            }
        );

        this.mainQuerySubscription =
            this.watchQueryOption.valueChanges.subscribe(
                ({ data, loading }) => {
                    this.displayData = this.displayData.concat(
                        this.mapGqlResultsToDisplayData(data)
                    );

                    this.loading = loading;
                    this.offset = this.displayData.length;
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
                this.displayData = this.displayData.concat(
                    this.mapGqlResultsToDisplayData(data)
                );

                this.loading = loading;
                this.offset = this.displayData.length;
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

    ngOnDestroy(): void {
        this.mainQuerySubscription?.unsubscribe();
    }

    ngAfterViewInit(): void {
        // Maintain scroll position on new data load
        this.tableInstance.normalScrollElement.nativeElement.scrollTop = 0;
    }
}
