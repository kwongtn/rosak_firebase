import { firstValueFrom } from "rxjs";
import { environment } from "src/environments/environment";

import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";

export interface TVehicleSpottingTrend {
    vehicle: string;
    count: number;
    dateKey: string;
    dayOfWeek: number;
    weekOfYear: number;
    isLastDayOfMonth: boolean;
    isLastWeekOfMonth: boolean;
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
    ): Promise<TVehicleSpottingTrend[]> {
        return firstValueFrom<TVehicleSpottingTrend[]>(
            this.http.get<TVehicleSpottingTrend[]>(
                `${environment.backendUrl}operation/vehicle_spotting_trend/${lineId}/${startDateString}/${endDateString}/`
            )
        );
    }
}
