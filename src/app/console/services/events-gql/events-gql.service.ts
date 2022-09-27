import { gql, Query } from "apollo-angular";
import { VehicleStatus } from "src/app/models/query/get-vehicles";
import { SpottingType } from "src/app/models/spotting-table/source-type";

import { Injectable } from "@angular/core";

export interface ConsoleEventsGqlResponseElement {
    id: string;
    spottingDate: string;
    notes: string;
    created: string;
    status: VehicleStatus;
    type: SpottingType;
    vehicle: {
        status: VehicleStatus;
        identificationNo: string;
        vehicleType: {
            internalName: string;
        };
        lines: [
            {
                code: string;
            }
        ];
    };
}

export interface ConsoleEventsGqlResponse {
    eventsLastThreeDays: ConsoleEventsGqlResponseElement[];
    eventsLastFiveDaysHasNotes: ConsoleEventsGqlResponseElement[];
    eventsLastSevenDaysDifferentStatusThanVehicle: ConsoleEventsGqlResponseElement[];
}

@Injectable({
    providedIn: "root",
})
export class ConsoleEventsGqlService extends Query<ConsoleEventsGqlResponse> {
    override document = gql`
        query (
            $eventsLastThreeDaysFilters: EventFilter
            $eventsLastFiveDaysHasNotesFilters: EventFilter
            $eventsLastSevenDaysDifferentStatusThanVehicleFilters: EventFilter
        ) {
            eventsLastThreeDays: events(filters: $eventsLastThreeDaysFilters) {
                id
                spottingDate
                notes
                status
                type
                created
                vehicle {
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
            eventsLastFiveDaysHasNotes: events(
                filters: $eventsLastFiveDaysHasNotesFilters
            ) {
                id
                spottingDate
                notes
                status
                type
                created
                vehicle {
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
            eventsLastSevenDaysDifferentStatusThanVehicle: events(
                filters: $eventsLastSevenDaysDifferentStatusThanVehicleFilters
            ) {
                id
                spottingDate
                notes
                status
                type
                created
                vehicle {
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
