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
                id
                spottingDate
                status
                type
                notes
                runNumber
                mediaCount
                isMine
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
