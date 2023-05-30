import { Apollo, gql } from "apollo-angular";
import { Subscription } from "rxjs";
import { VehicleType } from "src/app/models/query/get-vehicles";
import { TableDataType } from "src/app/models/spotting-table/source-type";
import {
    tagListDisplayConfig,
    TagListDisplayConfig,
} from "src/app/spotting/utils";

import {
    Component,
    Input,
    OnChanges,
    OnDestroy,
    OnInit,
    SimpleChanges,
} from "@angular/core";

const GET_VEHICLES = gql`
    query ($vehicleTypeFilter: VehicleTypeFilter) {
        vehicleTypes(filters: $vehicleTypeFilter) {
            id
            internalName
            displayName
            vehicleStatusDecommissionedCount
            vehicleStatusInServiceCount
            vehicleStatusNotSpottedCount
            vehicleStatusOutOfServiceCount
            vehicleStatusTestingCount
            vehicleStatusUnknownCount
            vehicleStatusMarriedCount
            vehicleTotalCount
            vehicles {
                id
                identificationNo
                status
                nickname
                lastSpottingDate
                inServiceSince
                spottingCount
                notes
                canExpand
            }
        }
    }
`;

@Component({
    selector: "app-vehicle-type-container",
    templateUrl: "./vehicle-type-container.component.html",
    styleUrls: ["./vehicle-type-container.component.scss"],
})
export class VehicleTypeContainerComponent
implements OnInit, OnChanges, OnDestroy
{
    @Input() tableData!: TableDataType[];
    @Input() lineId!: string | number;
    @Input() title!: string;

    showLoading: boolean = true;
    private querySubscription!: Subscription;

    totalCount: number = 0;

    tagListDisplayConfig: TagListDisplayConfig[] = JSON.parse(
        JSON.stringify(tagListDisplayConfig)
    );

    constructor(private apollo: Apollo) {
        return;
    }

    filterTabItems(data: VehicleType[]): void {
        // Reset counts
        this.tagListDisplayConfig.forEach((val) => {
            val.count = 0;
        });
        this.totalCount = 0;

        if (!data) {
            return;
        }

        const sectionData: TableDataType[] = [];
        for (const vehicleType of data) {
            sectionData.push({
                displayName: vehicleType.displayName,
                vehicleStatusCount: {
                    vehicleStatusDecommissionedCount:
                        vehicleType.vehicleStatusDecommissionedCount,
                    vehicleStatusInServiceCount:
                        vehicleType.vehicleStatusInServiceCount,
                    vehicleStatusNotSpottedCount:
                        vehicleType.vehicleStatusNotSpottedCount,
                    vehicleStatusOutOfServiceCount:
                        vehicleType.vehicleStatusOutOfServiceCount,
                    vehicleStatusTestingCount:
                        vehicleType.vehicleStatusTestingCount,
                    vehicleStatusUnknownCount:
                        vehicleType.vehicleStatusUnknownCount,
                    vehicleStatusMarriedCount:
                        vehicleType.vehicleStatusMarriedCount,
                    vehicleTotalCount: vehicleType.vehicleTotalCount,
                },
                tableData: vehicleType.vehicles
                    .map((value) => {
                        return {
                            id: value.id,
                            identificationNo: value.identificationNo,
                            status: value.status,
                            inServiceSince: value.inServiceSince,
                            lastSpotted: value.lastSpottingDate,
                            timesSpotted: value.spottingCount,
                            notes: value.notes,
                            nickname: value.nickname,
                            $expandConfig: {
                                expandable: value.canExpand,
                                expand: false,
                            },
                        };
                    })
                    .sort((a, b) => {
                        return a.identificationNo.localeCompare(
                            b.identificationNo
                        );
                    }),
            });

            this.tagListDisplayConfig.forEach((val) => {
                this.totalCount += vehicleType[val.key];
                if (val.count) {
                    val.count += vehicleType[val.key];
                } else {
                    val.count = vehicleType[val.key];
                }
            });
        }

        console.log("sectionData: ", sectionData);

        this.tableData = sectionData;
    }

    ngOnInit(): void {
        return;
    }

    ngOnChanges(changes: SimpleChanges): void {
        console.log(changes);

        this.tableData = [];

        this.showLoading = true;

        this.querySubscription = this.apollo
            .query<{ vehicleTypes: VehicleType[] }>({
                query: GET_VEHICLES,
                variables: {
                    vehicleTypeFilter: {
                        lineId: changes["lineId"].currentValue,
                    },
                },
            })
            .subscribe(({ data, loading }) => {
                this.showLoading = false;
                console.log(data);
                this.filterTabItems(data.vehicleTypes);
            });
    }

    ngOnDestroy() {
        this.querySubscription.unsubscribe();
    }
}
