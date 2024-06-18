import { QueryRef } from "apollo-angular";
import { DataTableComponent, TableWidthConfig } from "ng-devui";
import { ICategorySearchTagItem, SearchEvent } from "ng-devui/category-search";
import { Subscription } from "rxjs";
import { LastSpottingsTableElement } from "src/app/models/query/get-vehicles";
import { AuthService } from "src/app/services/auth.service";
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
} from "../services/events-gql.service";
import { MarkReadService } from "../services/mark-read.service";
import { categoryData } from "./category-search";

const SEARCH_LIMIT = 100;
const SEARCH_OFFSET = 0;

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
    category = categoryData;
    filters: { [key: string]: any } = {
        isRead: false,
    };

    allChecked: boolean = false;
    halfChecked: boolean = false;
    showLoading: boolean = true;

    showCheckbox: boolean = false;

    backendUrl: string = environment.backendUrl;

    displayData: TableSourceType[] = [];
    totalCount: number | undefined = undefined;
    expandConfig: { [key: string]: boolean } = {};

    lastSelectedRow: any = undefined;
    isShiftKeyDown: boolean = false;

    selectedTags: ICategorySearchTagItem[] = [
        {
            label: "Is Read",
            field: "isRead",
            value: {
                label: "No",
                value: {
                    value: false,
                },
            },
        },
    ];
    searchKey: string = "";

    // Pagination
    limit = SEARCH_LIMIT;
    offset = SEARCH_OFFSET;

    dataTableOptions = {
        columns: [
            {
                field: "id",
                header: "Event ID",
                fieldType: "id",
                order: 1,
            },
            {
                field: "reporter",
                header: "Reporter",
                fieldType: "reporter",
                order: 2,
            },
            {
                field: "created",
                header: "Created",
                fieldType: "datetime",
                order: 3,
            },
            {
                field: "status",
                header: "Status",
                fieldType: "status",
                order: 4,
            },
            {
                field: "spottingDate",
                header: "Date",
                fieldType: "text",
                order: 5,
            },
            {
                field: "type",
                header: "Spotting Type",
                fieldType: "spottingType",
                order: 6,
            },
            {
                field: "vehicle",
                header: "Vehicle",
                fieldType: "vehicle",
                order: 7,
            },
            {
                field: "notes",
                header: "Notes",
                fieldType: "notes",
                order: 8,
            },
        ],
    };

    tableWidthConfig: TableWidthConfig[] = [
        { field: "id", width: "100px" },
        { field: "reporter", width: "100px" },
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
                eventFilters: this.filters,
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
                    this.expandConfig = this.mapGqlResultsToExpandConfig(data);

                    this.totalCount = data.eventsCount;
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
        if (event) {
            this.tableWidthConfig.unshift({ field: "checkbox", width: "50px" });
        } else {
            this.tableWidthConfig = this.tableWidthConfig.filter((value) => {
                return value.field !== "checkbox";
            });
        }

        this.showCheckbox = event;
    }

    loadMore($event: DataTableComponent) {
        this.showLoading = true;

        this.watchQueryOption
            .fetchMore({
                variables: {
                    eventFilters: this.filters,
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
                this.expandConfig = {
                    ...this.expandConfig,
                    ...this.mapGqlResultsToExpandConfig(data),
                };
                this.totalCount = data.eventsCount;

                this.showLoading = loading;
                this.offset = this.displayData.length;
            });
    }

    mapGqlResultsToExpandConfig(data: any) {
        const returnObj: { [key: string]: boolean } = {};
        data.events.forEach((val: LastSpottingsTableElement) => {
            returnObj[val.id] = false;
        });
        return returnObj;
    }

    ngOnDestroy(): void {
        this.eventGqlSubscription?.unsubscribe();
    }

    mapGqlResultsToDisplayData(
        data: ConsoleEventsGqlResponseElement[]
    ): TableSourceType[] {
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

    searchEvent(event: SearchEvent) {
        console.log("search items", event);
        this.showLoading = true;
        this.limit = SEARCH_LIMIT;
        this.offset = SEARCH_OFFSET;

        this.filters = this.tagsToGqlMapper(event.selectedTags);

        if (event.searchKey) {
            this.filters["freeSearch"] = event.searchKey;
        }

        console.log(this.filters);

        this.watchQueryOption
            .fetchMore({
                variables: {
                    eventFilters: this.filters,
                    eventPagination: {
                        limit: this.limit,
                        offset: this.offset,
                    },
                },
            })
            .then(({ data, loading }) => {
                this.displayData = this.mapGqlResultsToDisplayData(data.events);
                this.totalCount = data.eventsCount;

                this.showLoading = loading;
                this.offset = this.displayData.length;
            });
    }

    tagsToGqlMapper(tags: ICategorySearchTagItem[]) {
        const returnObj: { [key: string]: any } = {};
        tags.forEach((elem) => {
            switch (elem.field) {
            case "isVehicleStatusDifferent":
                returnObj["differentStatusThanVehicle"] = (
                        elem.value?.value as any
                ).value;
                break;

            case "isAnonymous":
                returnObj["isAnonymous"] = (elem.value?.value as any).value;
                break;

            case "isRead":
                returnObj["isRead"] = (elem.value?.value as any).value;
                break;

            case "hasNotes":
                returnObj["hasNotes"] = (elem.value?.value as any).value;
                break;

            case "status":
                returnObj["statusIn"] = (elem.value?.value as any[]).map(
                    (val) => {
                        return val.value;
                    }
                );
                break;

            case "spottingType":
                returnObj["typeIn"] = (elem.value?.value as any[]).map(
                    (val) => {
                        return val.value;
                    }
                );
                break;

            case "createdTime":
                returnObj["created"] = {
                    range: {
                        start: new Date((elem.value as any).value[0]),
                        end: new Date((elem.value as any).value[1]),
                    },
                };
                break;

            case "spottedDate":
                returnObj["spotted"] = {
                    range: {
                        start: new Date((elem.value as any).value[0]),
                        end: new Date((elem.value as any).value[1]),
                    },
                };
                break;
            }
        });

        return returnObj;
    }
}
