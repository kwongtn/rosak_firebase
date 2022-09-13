import { gql, Query } from "apollo-angular";
import { GetLinesAndVehiclesResponse } from "src/app/models/query/get-vehicles";

import { Injectable } from "@angular/core";

@Injectable({
    providedIn: "any",
})
export class GetLinesAndVehiclesGqlService extends Query<GetLinesAndVehiclesResponse> {
    override document = gql`
        query GetLinesAndVehicles {
            lines {
                id
                code
                displayName
                vehicleTypes {
                    id
                    internalName
                    displayName
                    vehicles {
                        id
                        identificationNo
                        status
                    }
                }
            }
        }
    `;
}
