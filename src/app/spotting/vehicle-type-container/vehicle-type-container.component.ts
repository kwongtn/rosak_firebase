import { Apollo, gql } from "apollo-angular";
import { Subscription } from "rxjs";
import { VehicleType } from "src/app/models/query/get-vehicles";
import { TableDataType } from "src/app/models/spotting-table/source-type";

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
            vehicleStatusTestingCount
            vehicleStatusUnknownCount
            vehicleStatusMarriedCount
            vehicleTotalCount
            vehicles {
                id
                identificationNo
                status
                lastSpottingDate
                inServiceSince
                spottingCount
                notes
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

    showLoading: boolean = true;
    private querySubscription!: Subscription;

    constructor(private apollo: Apollo) {
        return;
    }

    filterTabItems(data: VehicleType[]): void {
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
                            identificationNo: value.identificationNo,
                            status: value.status,
                            inServiceSince: value.inServiceSince,
                            lastSpotted: value.lastSpottingDate,
                            timesSpotted: value.spottingCount,
                            notes: value.notes,
                        };
                    })
                    .sort((a, b) => {
                        return a.identificationNo.localeCompare(
                            b.identificationNo
                        );
                    }),
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
