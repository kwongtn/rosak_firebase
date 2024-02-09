import { firstValueFrom } from "rxjs";
import { environment } from "src/environments/environment";

import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";

export interface TVehicleStatusTrendCount {
    count: number;
    date: string;
    status: string;
}

@Injectable({
    providedIn: "root",
})
export class GetDataService {
    constructor(private http: HttpClient) {}

    public getData(
        lineId: string,
        source: "MLPTF" | "MTREC",
        startDateString: string,
        endDateString: string
    ): Promise<TVehicleStatusTrendCount[]> {
        return firstValueFrom<TVehicleStatusTrendCount[]>(
            this.http.get<TVehicleStatusTrendCount[]>(
                `${environment.backendUrl}operation/line_vehicles_status_trend_count/${lineId}/${source}/${startDateString}/${endDateString}/`
            )
        );
    }
}
