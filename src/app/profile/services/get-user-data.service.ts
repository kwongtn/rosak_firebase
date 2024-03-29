import { gql, Query } from "apollo-angular";

import { Injectable } from "@angular/core";

export interface DateTrends {
    dateKey: string;
    year: number;
    month: number | null;
    day: number | null;
    count: number;
}

export interface UserSpottingTrends extends DateTrends {
    eventType: string;
}

export interface UserFavouriteVehicle {
    vehicle: {
        identificationNo: string;
        lines: {
            code: string;
        }[];
    };
    count: number;
}

export interface UserDataResponseUser {
    nickname: string;
    spottingsCount: number;
    mediaCount: number;
    spottingTrends: UserSpottingTrends[];
    // withMostEntriesYear: DateTrends;
    withMostEntriesMonth: DateTrends;
    withMostEntriesDay: DateTrends;
    favouriteVehicles: UserFavouriteVehicle[];
}

export interface UserDataResponse {
    user: UserDataResponseUser;
}

@Injectable({
    providedIn: "root",
})
export class GetUserDataService extends Query<UserDataResponse> {
    override document = gql`
        query (
            $dateGroup: DateGroupings
            $typeGroup: Boolean
            $freeRange: Boolean
        ) {
            user {
                nickname
                spottingsCount
                mediaCount
                spottingTrends(
                    dateGroup: $dateGroup
                    typeGroup: $typeGroup
                    freeRange: $freeRange
                ) {
                    dateKey
                    year
                    month
                    day
                    eventType
                    count
                }
                # withMostEntriesYear: withMostEntries(type: YEAR) {
                #     dateKey
                #     year
                #     month
                #     day
                #     count
                # }
                withMostEntriesMonth: withMostEntries(type: MONTH) {
                    dateKey
                    year
                    month
                    day
                    count
                }
                withMostEntriesDay: withMostEntries(type: DAY) {
                    dateKey
                    year
                    month
                    day
                    count
                }
                favouriteVehicles {
                    vehicle {
                        identificationNo
                        lines {
                            code
                        }
                    }
                    count
                }
            }
        }
    `;
}
