import { QueryRef } from "apollo-angular";
import { NzButtonModule } from "ng-zorro-antd/button";
import { NzCheckboxModule } from "ng-zorro-antd/checkbox";
import { NzDatePickerModule } from "ng-zorro-antd/date-picker";
import { NzFormModule } from "ng-zorro-antd/form";
import { NzInputModule } from "ng-zorro-antd/input";
import { NzRadioModule } from "ng-zorro-antd/radio";
import { NzSelectModule } from "ng-zorro-antd/select";
import { NzSpinModule } from "ng-zorro-antd/spin";
import { NzSwitchModule } from "ng-zorro-antd/switch";
import { NzTableModule } from "ng-zorro-antd/table";
import { NzToolTipModule } from "ng-zorro-antd/tooltip";
import { Subscription } from "rxjs";
import {
    SpottingTypeCellDisplayComponent,
} from "src/app/@ui/spotting-type-cell-display/spotting-type-cell-display.component";
import {
    ImagePreviewButtonComponent,
} from "src/app/@ui/spotting/image-preview-button/image-preview-button.component";
import {
    VehicleStatusTagComponent,
} from "src/app/@ui/vehicle-status-tag/vehicle-status-tag.component";
import {
    VehicleTableCellDisplayComponent,
} from "src/app/@ui/vehicle-table-cell-display/vehicle-table-cell-display.component";
import { AuthService } from "src/app/services/auth.service";
import { environment } from "src/environments/environment";

import { CommonModule } from "@angular/common";
import {
    AfterViewInit,
    Component,
    ElementRef,
    HostListener,
    OnDestroy,
    OnInit,
    ViewChild,
} from "@angular/core";
import { FormsModule } from "@angular/forms";

import {
    ConsoleEventsGqlResponseElement,
    ConsoleEventsGqlResponseTableDataElement,
    ConsoleEventsGqlService,
} from "../services/events-gql.service";
import { MarkReadService } from "../services/mark-read.service";
import { spottingTypeOptions, statusOptions } from "./category-search";

const SEARCH_LIMIT = 100;
const SEARCH_OFFSET = 0;

// How close to the bottom (px) of the scrollable table body before triggering loadMore().
const LOAD_MORE_THRESHOLD_PX = 50;

interface TableSourceType extends ConsoleEventsGqlResponseTableDataElement {
    $checked?: boolean;
    $checkDisabled?: boolean;
}

interface TableWidthConfig {
    field: string;
    width: string;
}

// undefined means "don't filter on this field" (the "Any" radio option).
interface FilterFormModel {
    status: string[];
    spottingType: string[];
    createdTimeRange: [Date, Date] | null;
    spottedDateRange: [Date, Date] | null;
    isVehicleStatusDifferent: boolean | undefined;
    isAnonymous: boolean | undefined;
    isRead: boolean | undefined;
    hasNotes: boolean | undefined;
    freeSearch: string;
}

@Component({
    selector: "console-events-table",
    templateUrl: "./events-table.component.html",
    styleUrls: ["./events-table.component.scss"],
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ImagePreviewButtonComponent,
        NzButtonModule,
        NzCheckboxModule,
        NzDatePickerModule,
        NzFormModule,
        NzInputModule,
        NzRadioModule,
        NzSelectModule,
        NzSpinModule,
        NzSwitchModule,
        NzTableModule,
        NzToolTipModule,
        SpottingTypeCellDisplayComponent,
        VehicleStatusTagComponent,
        VehicleTableCellDisplayComponent,
    ]
})
export class ConsoleEventsTableComponent
implements OnInit, AfterViewInit, OnDestroy
{
    @ViewChild("tableWrapper", { read: ElementRef })
        tableWrapperRef?: ElementRef<HTMLElement>;
    private scrollBody: HTMLElement | null = null;
    private onScroll = (event: Event) => {
        const el = event.target as HTMLElement;
        if (
            !this.showLoading &&
            el.scrollTop + el.clientHeight >= el.scrollHeight - LOAD_MORE_THRESHOLD_PX
        ) {
            this.loadMore();
        }
    };

    eventGqlSubscription!: Subscription;
    statusOptions = statusOptions;
    spottingTypeOptions = spottingTypeOptions;
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

    // TableSourceType doesn't declare every field actually present on row data (e.g.
    // runNumber, wheelStatus, reporter, mediaCount) - exposed as `any[]` here so the table
    // template can read them, matching how the previous data-table's untyped row template
    // context worked.
    get tableRows(): any[] {
        return this.displayData;
    }

    lastSelectedRow: any = undefined;
    isShiftKeyDown: boolean = false;

    filterForm: FilterFormModel = {
        status: [],
        spottingType: [],
        createdTimeRange: null,
        spottedDateRange: null,
        isVehicleStatusDifferent: undefined,
        isAnonymous: undefined,
        isRead: false,
        hasNotes: undefined,
        freeSearch: "",
    };

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

    ngAfterViewInit(): void {
        this.scrollBody =
            this.tableWrapperRef?.nativeElement.querySelector<HTMLElement>(
                ".ant-table-body"
            ) ?? null;
        this.scrollBody?.addEventListener("scroll", this.onScroll);
    }

    widthFor(field: string): string {
        return this.tableWidthConfig.find((c) => c.field === field)?.width ?? "";
    }

    get scrollX(): string {
        const width = this.tableWidthConfig.reduce((sum, c) => {
            return sum + parseInt(c.width, 10);
        }, this.showCheckbox ? 50 : 0);
        return `${width}px`;
    }

    markAsRead() {
        this.showLoading = true;
        const rows = this.displayData
            .filter((value) => value.$checked)
            .map((value) => value.id);

        this.markReadService.markAsRead(rows).then(({ data, loading }) => {
            if (data?.markAsRead.ok) {
                this.displayData = this.displayData.filter((elem) => {
                    return !rows.includes(elem.id);
                });
            }
            this.showLoading = loading ?? false;
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

    onRowCheckChange(checked: boolean, rowIndex: any, rowItem: any) {
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
    }

    onToggleChange(event: boolean) {
        this.showCheckbox = event;
    }

    loadMore() {
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
        data.events.forEach((val: any) => {
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

    onSearch() {
        this.showLoading = true;
        this.limit = SEARCH_LIMIT;
        this.offset = SEARCH_OFFSET;

        this.filters = this.filterFormToGqlFilters();

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

    private filterFormToGqlFilters(): { [key: string]: any } {
        const form = this.filterForm;
        const returnObj: { [key: string]: any } = {};

        if (form.status.length) {
            returnObj["statusIn"] = form.status;
        }
        if (form.spottingType.length) {
            returnObj["typeIn"] = form.spottingType;
        }
        if (form.createdTimeRange) {
            returnObj["created"] = {
                range: {
                    start: form.createdTimeRange[0],
                    end: form.createdTimeRange[1],
                },
            };
        }
        if (form.spottedDateRange) {
            returnObj["spotted"] = {
                range: {
                    start: form.spottedDateRange[0],
                    end: form.spottedDateRange[1],
                },
            };
        }
        if (form.isVehicleStatusDifferent !== undefined) {
            returnObj["differentStatusThanVehicle"] =
                form.isVehicleStatusDifferent;
        }
        if (form.isAnonymous !== undefined) {
            returnObj["isAnonymous"] = form.isAnonymous;
        }
        if (form.isRead !== undefined) {
            returnObj["isRead"] = form.isRead;
        }
        if (form.hasNotes !== undefined) {
            returnObj["hasNotes"] = form.hasNotes;
        }
        if (form.freeSearch) {
            returnObj["freeSearch"] = form.freeSearch;
        }

        return returnObj;
    }
}
