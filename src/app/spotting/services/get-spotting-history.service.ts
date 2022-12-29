import { gql, Query } from "apollo-angular";
import {
    GetVehiclesLastSpottingResponse,
} from "src/app/models/query/get-vehicles";

import { Injectable } from "@angular/core";

@Injectable({
    providedIn: "root",
})
export class GetSpottingHistoryService extends Query<GetVehiclesLastSpottingResponse> {
    override document = gql`
        query (
            $eventFilters: EventFilter
            $eventPagination: OffsetPaginationInput
            $eventOrder: EventOrder
        ) {
            events(
                filters: $eventFilters
                pagination: $eventPagination
                order: $eventOrder
            ) {
                spottingDate
                status
                type
                notes
                location {
                    accuracy
                    altitudeAccuracy
                    heading
                    speed
                    location
                    altitude
                }
                originStation {
                    id
                    displayName
                }
                destinationStation {
                    id
                    displayName
                }
            }
        }
    `;
}
