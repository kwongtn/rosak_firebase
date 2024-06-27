import { QueryRef } from "apollo-angular";
import {
    DataTableComponent,
    DataTableModule,
    LoadingModule,
    TableWidthConfig,
} from "ng-devui";
import { ReCaptchaV3Service } from "ng-recaptcha";
import { NzToolTipModule } from "ng-zorro-antd/tooltip";
import { firstValueFrom, lastValueFrom, Subscription } from "rxjs";
import {
    SpottingTypeCellDisplayComponent,
} from "src/app/@ui/spotting-type-cell-display/spotting-type-cell-display.component";
import {
    ImagePreviewButtonComponent,
} from "src/app/@ui/spotting/image-preview-button/image-preview-button.component";
import {
    VehicleStatusTagModule,
} from "src/app/@ui/vehicle-status-tag/vehicle-status-tag.module";
import {
    VehicleTableCellDisplayComponent,
} from "src/app/@ui/vehicle-table-cell-display/vehicle-table-cell-display.component";
import {
    ConsoleEventsGqlResponseTableDataElement,
} from "src/app/console/services/events-gql.service";
import { LastSpottingsTableElement } from "src/app/models/query/get-vehicles";
import { AuthService } from "src/app/services/auth.service";
import { ToastService } from "src/app/services/toast.service";
import { environment } from "src/environments/environment";

import { CommonModule } from "@angular/common";
import { AfterViewInit, Component, OnDestroy, OnInit } from "@angular/core";

import { DeleteEventService } from "../services/delete-event.service";
import {
    GetEventsGqlResponse,
    GetEventsService,
} from "../services/get-events.service";

@Component({
    selector: "profile-spottings",
    templateUrl: "./spottings.component.html",
    styleUrls: ["./spottings.component.scss"],
    standalone: true,
    imports: [
        CommonModule,
        DataTableModule,
        ImagePreviewButtonComponent,
        LoadingModule,
        NzToolTipModule,
        SpottingTypeCellDisplayComponent,
        VehicleStatusTagModule,
        VehicleTableCellDisplayComponent,
    ],
})
export class ProfileSpottingsComponent
implements OnInit, OnDestroy, AfterViewInit
{
    // @ViewChild("tableInstance") tableInstance!: DataTableComponent;
    private mainQuerySubscription!: Subscription;
    loading = true;

    // Pagination
    limit = 30;
    offset = 0;

    displayData: ConsoleEventsGqlResponseTableDataElement[] = [];
    expandConfig: { [key: string]: boolean } = {};

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
                fieldType: "notes",
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
        private deleteEventGql: DeleteEventService,
        private recaptchaV3Service: ReCaptchaV3Service,
        private toastService: ToastService,
        public authService: AuthService
    ) {}

    async ngOnInit() {
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
                        "firebase-auth-key":
                            await this.authService.getIdToken(),
                    },
                },
                fetchPolicy: "network-only",
            }
        );

        this.mainQuerySubscription =
            this.watchQueryOption.valueChanges.subscribe(
                ({
                    data,
                    loading,
                }: {
                    data: GetEventsGqlResponse;
                    loading: boolean;
                }) => {
                    this.displayData = this.mapGqlResultsToDisplayData(data);
                    this.expandConfig = this.mapGqlResultsToExpandConfig(data);

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
                this.expandConfig = {
                    ...this.expandConfig,
                    ...this.mapGqlResultsToExpandConfig(data),
                };

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

            const created = new Date(val.created);
            const now = new Date();

            // If entry created more than 3 days you cannot delete it
            if (now.valueOf() - created.valueOf() <= 864e6) {
                returnObj.canDelete = true;
            } else {
                returnObj.canDelete = false;
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

    deleteEvent(eventId: string) {
        this.loading = true;

        Promise.all([
            firstValueFrom(
                this.recaptchaV3Service.execute("deleteSpottingEntry")
            ),
            this.authService.getIdToken(),
        ])
            .then(async ([captchaResponse, firebaseAuthKey]) => {
                const mutationObservable = this.deleteEventGql.mutate(
                    {
                        deleteEventInput: {
                            id: eventId,
                        },
                    },
                    {
                        context: {
                            headers: {
                                "g-recaptcha-response": captchaResponse,
                                "firebase-auth-key": firebaseAuthKey,
                            },
                        },
                    }
                );

                return await lastValueFrom(mutationObservable);
            })
            .then(({ data }) => {
                if (data?.["deleteEvent"].ok) {
                    this.displayData = this.displayData.filter((elem) => {
                        return elem.id !== eventId;
                    });

                    this.toastService.addToast(
                        "Success",
                        `Deletion of spotting event #${eventId} successful.`,
                        "success"
                    );
                } else {
                    this.toastService.addToast(
                        "Error",
                        "Unknown error on deletion. Please refresh the page and try again.",
                        "error"
                    );
                }

                this.loading = false;
            });
    }

    onPictureIconClick(eventId: string) {
        this.expandConfig[eventId] = !this.expandConfig[eventId];
    }

    ngOnDestroy(): void {
        this.mainQuerySubscription?.unsubscribe();
    }

    ngAfterViewInit(): void {
        // Maintain scroll position on new data load
        // this.tableInstance.normalScrollElement.nativeElement.scrollTop = 0;
    }
}
