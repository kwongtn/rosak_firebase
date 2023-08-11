import { Subscription } from "rxjs";

import { Component, Input, OnDestroy } from "@angular/core";
import { ActivatedRoute } from "@angular/router";

import { data, LinesVehiclesStationData, VehiclesStationsData } from "../data";

export interface BreadcrumbsData {
    displayText: string;
    href: string[] | number[];
}

@Component({
    selector: "situasi-content",
    templateUrl: "./content.component.html",
    styleUrls: ["./content.component.scss"],
})
export class ContentComponent implements OnDestroy {
    @Input() title: string = "Title";
    @Input() subtitle: string = "subtitle";

    lineId!: string;
    assetType!: string;
    assetId!: string;

    displayLineString!: string;
    displayAssetString!: string;

    menuData = data;

    @Input() breadcrumbsData: BreadcrumbsData[] = [];

    private routeSubscription!: Subscription;

    constructor(private route: ActivatedRoute) {
        this.routeSubscription = this.route.params.subscribe((params: any) => {
            console.log(params);
            this.lineId = params["lineId"];
            this.assetType = params["assetType"];
            this.assetId = params["assetId"];

            const currentLine = this.menuData.find((elem) => {
                return elem.id === this.lineId;
            });

            this.displayLineString = currentLine?.displayName || "Unknown Line";

            const assetVerb: "vehicles" | "stations" =
                this.assetType === "vehicle" ? "vehicles" : "stations";

            this.displayAssetString =
                (
                    (currentLine as LinesVehiclesStationData)[
                        assetVerb
                    ] as VehiclesStationsData[]
                ).find((asset) => {
                    return this.assetId === asset.id;
                })?.displayName || `Unknown ${this.assetType}`;

            this.breadcrumbsData = [
                {
                    displayText: this.displayLineString,
                    href: [this.lineId],
                },
                {
                    displayText: assetVerb.charAt(0).toUpperCase() + assetVerb.slice(1),
                    href: [this.lineId, this.assetType],
                },
                {
                    displayText: this.displayAssetString,
                    href: [this.lineId, this.assetType, this.assetId],
                },
            ];
        });
    }

    ngOnDestroy(): void {
        this.routeSubscription?.unsubscribe();
    }
}
