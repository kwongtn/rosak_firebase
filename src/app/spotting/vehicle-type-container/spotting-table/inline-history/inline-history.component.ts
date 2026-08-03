import { QueryRef } from "apollo-angular";
import { NzSpinModule } from "ng-zorro-antd/spin";
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
    GetVehiclesLastSpottingResponse,
    LastSpottingsTableElement,
} from "src/app/models/query/get-vehicles";
import {
    GetSpottingHistoryService,
} from "src/app/spotting/services/get-spotting-history.service";

import { CommonModule } from "@angular/common";
import {
    AfterViewInit,
    Component,
    ElementRef,
    Input,
    OnDestroy,
    OnInit,
    ViewChild,
} from "@angular/core";

interface TableWidthConfig {
    field: string;
    width: string;
}

// How close to the bottom (px) of the scrollable table body before triggering loadMore().
const LOAD_MORE_THRESHOLD_PX = 50;

@Component({
    selector: "spotting-table-inline-history",
    templateUrl: "./inline-history.component.html",
    styleUrls: ["./inline-history.component.scss"],
    standalone: true,
    imports: [
        CommonModule,
        ImagePreviewButtonComponent,
        NzSpinModule,
        NzTableModule,
        NzToolTipModule,
        SpottingTypeCellDisplayComponent,
        VehicleStatusTagComponent,
    ],
})
export class InlineHistoryComponent
implements OnInit, AfterViewInit, OnDestroy
{
    @Input() vehicleId!: string | number;

    @ViewChild("tableWrapper", { read: ElementRef })
        tableWrapperRef?: ElementRef<HTMLElement>;
    private scrollBody: HTMLElement | null = null;
    private onScroll = (event: Event) => {
        const el = event.target as HTMLElement;
        if (
            !this.loading &&
            el.scrollTop + el.clientHeight >= el.scrollHeight - LOAD_MORE_THRESHOLD_PX
        ) {
            this.loadMore();
        }
    };

    // Pagination
    limit = 30;
    offset = 0;
    watchQueryOption!: QueryRef<GetVehiclesLastSpottingResponse>;

    loading: boolean = true;
    querySubscription!: Subscription;

    dataSource: LastSpottingsTableElement[] = [];
    expandConfig: { [key: string]: boolean } = {};

    // LastSpottingsTableElement doesn't declare every field actually present on row data
    // (e.g. runNumber, wheelStatus, mediaCount) - exposed as `any[]` here so the table
    // template can read them, matching how the previous data-table's untyped row template
    // context worked.
    get tableRows(): any[] {
        return this.dataSource;
    }

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
                    vehicle: { id: this.vehicleId },
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

    loadMore() {
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
        this.scrollBody?.removeEventListener("scroll", this.onScroll);
    }
}
