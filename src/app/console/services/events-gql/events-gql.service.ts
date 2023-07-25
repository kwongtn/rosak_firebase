import { gql, Query } from "apollo-angular";
import { VehicleStatus } from "src/app/models/query/get-vehicles";
import { SpottingType } from "src/app/pipes/spotting-type/spotting-type.pipe";

import { Injectable } from "@angular/core";

export interface ConsoleEventsGqlResponseElementStation {
    id: string;
    displayName: string;
}

export interface ConsoleEventsGqlResponseElementReporter {
    shortId: string;
    nickname: string;
}

export interface ConsoleEventsGqlResponseElement {
    id: string;
    spottingDate: string;
    notes: string;
    created: string;
    status: VehicleStatus;
    type: SpottingType;
    originStation: ConsoleEventsGqlResponseElementStation | null;
    destinationStation: ConsoleEventsGqlResponseElementStation | null;
    reporter: ConsoleEventsGqlResponseElementReporter | null;
    runNumber: string | null;
    mediaCount: number;
    isMine: boolean;
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
    events: ConsoleEventsGqlResponseElement[];
}

export interface ConsoleEventsGqlResponseTableData {
    events: ConsoleEventsGqlResponseTableDataElement[];
    eventsCount: number;
}

@Injectable({
    providedIn: "root",
})
export class ConsoleEventsGqlService extends Query<ConsoleEventsGqlResponse> {
    override document = gql`
        query (
            $eventFilters: EventFilter
            $eventPagination: OffsetPaginationInput
            $eventOrder: EventOrder
        ) {
            eventsCount
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
                reporter {
                    shortId
                    nickname
                }
            }
        }
    `;
}
