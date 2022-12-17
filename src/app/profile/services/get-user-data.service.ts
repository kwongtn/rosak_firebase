import { gql, Query } from "apollo-angular";

import { Injectable } from "@angular/core";

export interface UserSpottingTrends {
    dateKey: string;
    year: number;
    month: number | null;
    day: number | null;
    count: number;
    eventType: string;
}

export interface UserDataResponseUser {
    firebaseId: string;
    spottingsCount: number;
    spottingTrends: UserSpottingTrends[];
}

export interface UserDataResponse {
    user: UserDataResponseUser;
}

@Injectable({
    providedIn: "root",
})
export class GetUserDataService extends Query<UserDataResponse> {
    override document = gql`
        query ($dateGroup: DateGroupings, $typeGroup: Boolean) {
            user {
                firebaseId
                spottingsCount
                spottingTrends(dateGroup: $dateGroup, typeGroup: $typeGroup) {
                    dateKey
                    year
                    month
                    day
                    eventType
                    count
                }
            }
        }
    `;
}
