import { gql, Query } from "apollo-angular";

import { Injectable } from "@angular/core";

export interface UserDataResponse {
    user: {
        firebaseId: string;
        spottingsCount: number;
    };
}

@Injectable({
    providedIn: "root",
})
export class GetUserDataService extends Query<UserDataResponse> {
    override document = gql`
        query {
            user {
                firebaseId
                spottingsCount
            }
        }
    `;
}
