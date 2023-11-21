import { gql, Query } from "apollo-angular";

import { Injectable } from "@angular/core";

export interface GetSpottingVehicleCalendarHeatmapResponse {
    vehicles: {
        id: string;
        identificationNo: string;
        nickname: string;
        spottingTrends: {
            dateKey: string;
            count: number;
            dayOfWeek: number;
            weekOfYear: number;
            isLastDayOfMonth: boolean;
            isLastWeekOfMonth: boolean;
        }[];
    }[];
}

@Injectable({
    providedIn: "any",
})
export class GetDataGqlService extends Query<GetSpottingVehicleCalendarHeatmapResponse> {
    override document = gql`
        query ($vehicleFilter: VehicleFilter) {
            vehicles(filters: $vehicleFilter) {
                id
                identificationNo
                nickname
            }
        }
    `;
}
