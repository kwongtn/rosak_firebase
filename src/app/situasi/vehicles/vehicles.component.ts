import { firstValueFrom, Subscription } from "rxjs";

import { Component, OnDestroy, OnInit } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";

import {
    GetGqlDataService,
    LineVehiclesChartographySource,
} from "./get-gql-data/get-gql-data.service";

export interface TabType {
    href: string;
    title: string;
}

@Component({
    selector: "situasi-vehicles",
    templateUrl: "./vehicles.component.html",
    styleUrls: ["./vehicles.component.scss"],
})
export class VehiclesComponent implements OnDestroy, OnInit {
    lineId: string | undefined = undefined;

    sources: LineVehiclesChartographySource[] = [];
    vehicleCount = -1;

    tabItems: TabType[] = [
        {
            href: "statusHistory",
            title: "Vehicle Status History",
        },
        {
            href: "spottingHeatmap",
            title: "Spotting Line Calendar Heatmap",
        },
    ];
    tabActiveIndex: number = 0;

    routeSubscription!: Subscription;

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private getGqlDataService: GetGqlDataService
    ) {}

    ngOnInit(): void {
        this.routeSubscription = this.route.params.subscribe((params) => {
            this.lineId = params["lineId"];

            const dataServiceSubscription = this.getGqlDataService.fetch({
                lineFilter: {
                    id: this.lineId,
                },
            });

            firstValueFrom(dataServiceSubscription).then(({ data }) => {
                this.sources = [...data.lines[0].chartographySources];
                this.vehicleCount = data.lines[0].vehicles.length;
            });

            this.tabActiveIndex = this.tabItems.findIndex(
                (item) => item.href === params["tabName"]
            );
        });
    }

    ngOnDestroy(): void {
        this.routeSubscription?.unsubscribe();
    }

    activeTabChange(index: number) {
        this.tabActiveIndex = index;
        this.router.navigate(
            [
                "situasi",
                this.lineId,
                "vehicle",
                this.tabItems[this.tabActiveIndex].href,
            ],
            {
                queryParamsHandling: "replace",
            }
        );
    }
}
