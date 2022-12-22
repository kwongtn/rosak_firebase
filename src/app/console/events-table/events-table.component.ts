import { QueryRef } from "apollo-angular";
import { DataTableComponent, TableWidthConfig } from "ng-devui";
import { Subscription } from "rxjs";
import { AuthService } from "src/app/services/auth/auth.service";
import { environment } from "src/environments/environment";

import {
    Component,
    HostListener,
    OnDestroy,
    OnInit,
    ViewChild,
} from "@angular/core";

import {
    ConsoleEventsGqlResponseElement,
    ConsoleEventsGqlResponseTableDataElement,
    ConsoleEventsGqlService,
} from "../services/events-gql/events-gql.service";
import { MarkReadService } from "../services/mark-read/mark-read.service";

interface TableSourceType extends ConsoleEventsGqlResponseTableDataElement {
    $checked?: boolean;
    $checkDisabled?: boolean;
}

@Component({
    selector: "console-events-table",
    templateUrl: "./events-table.component.html",
    styleUrls: ["./events-table.component.scss"],
})
export class ConsoleEventsTableComponent implements OnInit, OnDestroy {
    @ViewChild(DataTableComponent, { static: true })
        datatable!: DataTableComponent;
    eventGqlSubscription!: Subscription;

    allChecked: boolean = false;
    halfChecked: boolean = false;
    showLoading: boolean = false;

    showCheckbox: boolean = false;

    backendUrl: string = environment.backendUrl;

    displayData: TableSourceType[] = [];

    lastSelectedRow: any = undefined;
    isShiftKeyDown: boolean = false;

    // Pagination
    limit = 30;
    offset = 0;

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

    watchQueryOption!: QueryRef<any>;

    constructor(
        private markReadService: MarkReadService,
        private consoleEventsGqlService: ConsoleEventsGqlService,
        private authService: AuthService
    ) {
        return;
    }

    async ngOnInit(): Promise<void> {
        this.watchQueryOption = this.consoleEventsGqlService.watch(
            {
                eventFilters: {
                    isRead: false,
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
            }
        );

        this.eventGqlSubscription =
            this.watchQueryOption.valueChanges.subscribe(
                ({ data, loading }) => {
                    this.showLoading = loading;

                    this.displayData = this.mapGqlResultsToDisplayData(
                        data.events
                    );
                }
            );
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

    @HostListener("document:keydown.shift", ["$event"])
    handleKeyboardShiftUp(event: KeyboardEvent) {
        this.isShiftKeyDown = true;
    }

    @HostListener("document:keyup.shift", ["$event"])
    handleKeyboardShiftDown(event: KeyboardEvent) {
        this.isShiftKeyDown = false;
    }

    onRowCheckChange(
        checked: boolean,
        rowIndex: any,
        nestedIndex: any,
        rowItem: any
    ) {
        rowItem.$checked = checked;
        rowItem.$halfChecked = false;

        if (this.isShiftKeyDown) {
            const firstOfList = Math.min(this.lastSelectedRow, rowIndex);
            const lastOfList = Math.max(this.lastSelectedRow, rowIndex);
            this.displayData.forEach((value, index) => {
                if (index >= firstOfList && index <= lastOfList) {
                    value.$checked = checked;
                }
            });
        }

        this.lastSelectedRow = rowIndex;

        this.datatable.setRowCheckStatus({
            rowIndex: rowIndex,
            nestedIndex: nestedIndex,
            rowItem: rowItem,
            checked: checked,
        });
    }

    
    onToggleChange(event: boolean) {
        this.showCheckbox = event;
    }

    loadMore($event: DataTableComponent) {
        this.showLoading = true;

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
                    this.mapGqlResultsToDisplayData(data.events)
                );

                this.showLoading = loading;
                this.offset = this.displayData.length;
            });
    }

    ngOnDestroy(): void {
        this.eventGqlSubscription?.unsubscribe();
    }

    mapGqlResultsToDisplayData(
        data: ConsoleEventsGqlResponseElement[]
    ): TableSourceType[] {
        console.log(data);
        return data.map((val) => {
            const returnObj: any = {
                ...val,
                $checked: false,
                $checkDisabled: false,
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
}
