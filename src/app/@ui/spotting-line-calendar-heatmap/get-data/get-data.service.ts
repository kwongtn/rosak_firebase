import { firstValueFrom } from "rxjs";
import { environment } from "src/environments/environment";

import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";

export interface TLineVehicleSpottingTrend {
    vehicle: string;
    count: number;
    dateKey: string;
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
    ): Promise<TLineVehicleSpottingTrend[]> {
        return firstValueFrom<TLineVehicleSpottingTrend[]>(
            this.http.get<TLineVehicleSpottingTrend[]>(
                `${environment.backendUrl}operation/line_vehicles_spotting_trend/${lineId}/${startDateString}/${endDateString}/`
            )
        );
    }
}
