import { firstValueFrom } from "rxjs";
import { environment } from "src/environments/environment";

import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";

export interface TVehicleSpottingTrendData {
    vehicle: string;
    count: number;
    dateKey: string;
    dayOfWeek: number;
    yearWeek: string;
    isLastDayOfMonth: boolean;
    isLastWeekOfMonth: boolean;
}

export interface TVehicleSpottingTrend {
    mappings: {
        yearWeek: {
            [key: string]: number;
        };
    };
    data: TVehicleSpottingTrendData[];
}

@Injectable({
    providedIn: "root",
})
export class GetDataService {
    constructor(private http: HttpClient) {}

    public getData(
        lineId: string,
        startDateString: string,
        endDateString: string
    ): Promise<TVehicleSpottingTrend> {
        return firstValueFrom<TVehicleSpottingTrend>(
            this.http.get<TVehicleSpottingTrend>(
                `${environment.backendUrl}operation/vehicle_spotting_trend/${lineId}/${startDateString}/${endDateString}/`
            )
        );
    }
}
