import { gql, Query } from "apollo-angular";

import { Injectable } from "@angular/core";

export interface LocationData {
    locations: {
        dtGps: string;
        dtReceived: string;
        angle: number;
        dir: number;
        location: number[];
        speed: number;
    }[];
}

@Injectable({
    providedIn: "root",
})
export class GetLocationService extends Query<LocationData> {
    override document = gql`
        query (
            $filters: LocationFilter
            $pagination: OffsetPaginationInput
            $order: LocationOrder
        ) {
            locations(
                filters: $filters
                pagination: $pagination
                order: $order
            ) {
                dtGps
                dtReceived
                angle
                dir
                location
                speed
                # 		bus {
                # 			id
                # 			identifier
                # 			type {
                # 				id
                # 			}
                # 		}
            }
        }
    `;
}
