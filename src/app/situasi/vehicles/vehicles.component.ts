import { firstValueFrom, Subscription } from "rxjs";

import { Component, OnDestroy } from "@angular/core";
import { ActivatedRoute } from "@angular/router";

import {
    GetGqlDataService,
    LineVehiclesChartographySource,
} from "./get-gql-data/get-gql-data.service";

@Component({
    selector: "situasi-vehicles",
    templateUrl: "./vehicles.component.html",
    styleUrls: ["./vehicles.component.scss"],
})
export class VehiclesComponent implements OnDestroy {
    lineId: string | undefined = undefined;
    sources: LineVehiclesChartographySource[] = [];

    routeSubscription!: Subscription;

    constructor(
        private route: ActivatedRoute,
        private getGqlDataService: GetGqlDataService
    ) {
        this.routeSubscription = this.route.params.subscribe((params) => {
            this.lineId = params["lineId"];

            const dataServiceSubscription = this.getGqlDataService.fetch({
                lineFilter: {
                    id: this.lineId,
                },
            });

            firstValueFrom(dataServiceSubscription).then(({ data }) => {
                this.sources = [...data.lines[0].chartographySources];
            });
        });
    }

    ngOnDestroy(): void {
        this.routeSubscription?.unsubscribe();
    }
}
