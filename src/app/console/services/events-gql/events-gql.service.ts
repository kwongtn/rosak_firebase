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
        id: string;
        status: VehicleStatus;
        identificationNo: string;
        notes: string;
        vehicleType: {
            internalName: string;
        };
        lines: [
            {
                code: string;
            }
        ];
    };
    location: {
        accuracy: number;
        altitudeAccuracy: number | null;
        heading: number | null;
        speed: number | null;
        location: [number, number];
        altitude: number | null;
    } | null;
}

export interface ConsoleEventsGqlResponseTableDataElement
    extends Omit<ConsoleEventsGqlResponseElement, "location"> {
    location: {
        accuracy: number;
        altitudeAccuracy: number | null;
        heading: number | null;
        speed: number | null;
        latitude: number;
        longitude: number;
        altitude: number | null;
    } | null;
}

export interface ConsoleEventsGqlResponse {
    eventsLastThreeDays: ConsoleEventsGqlResponseElement[];
    eventsLastFiveDaysHasNotes: ConsoleEventsGqlResponseElement[];
    eventsLastSevenDaysDifferentStatusThanVehicle: ConsoleEventsGqlResponseElement[];
}

export interface ConsoleEventsGqlResponseTableData {
    eventsLastThreeDays: ConsoleEventsGqlResponseTableDataElement[];
    eventsLastFiveDaysHasNotes: ConsoleEventsGqlResponseTableDataElement[];
    eventsLastSevenDaysDifferentStatusThanVehicle: ConsoleEventsGqlResponseTableDataElement[];
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
                    id
                    status
                    identificationNo
                    notes
                    vehicleType {
                        internalName
                    }
                    lines {
                        code
                    }
                }
                location {
                    accuracy
                    altitudeAccuracy
                    heading
                    speed
                    location
                    altitude
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
                    id
                    status
                    identificationNo
                    notes
                    vehicleType {
                        internalName
                    }
                    lines {
                        code
                    }
                }
                location {
                    accuracy
                    altitudeAccuracy
                    heading
                    speed
                    location
                    altitude
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
                    id
                    status
                    identificationNo
                    notes
                    vehicleType {
                        internalName
                    }
                    lines {
                        code
                    }
                }
                location {
                    accuracy
                    altitudeAccuracy
                    heading
                    speed
                    location
                    altitude
                }
            }
        }
    `;
}
