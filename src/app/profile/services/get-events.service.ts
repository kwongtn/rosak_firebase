import { gql, Query } from "apollo-angular";
import {
    ConsoleEventsGqlResponseElement,
} from "src/app/console/services/events-gql/events-gql.service";

import { Injectable } from "@angular/core";

export interface GetEventsGqlResponse {
    events: ConsoleEventsGqlResponseElement[];
}

@Injectable({
    providedIn: "root",
})
export class GetEventsService extends Query<GetEventsGqlResponse> {
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
                notes
                created
                status
                type
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
                vehicle {
                    id
                    status
                    identificationNo
                    vehicleType {
                        internalName
                    }
                    lines {
                        code
                    }
                }
            }
        }
    `;
}
