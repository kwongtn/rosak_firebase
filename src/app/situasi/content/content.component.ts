import { Subscription } from "rxjs";

import { Component, Input, OnDestroy } from "@angular/core";
import { ActivatedRoute } from "@angular/router";

import { data } from "../data";

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

    titleString!: string;

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

            if (currentLine) {
                this.breadcrumbsData.push({
                    displayText: currentLine.displayName,
                    href: [this.lineId],
                });

                if (this.assetType) {
                    const assetVerb: "vehicles" | "stations" = (this.assetType +
                        "s") as any; // Assume is 'vehicles' or'stations'
                    this.breadcrumbsData.push({
                        displayText:
                            assetVerb.charAt(0).toUpperCase() +
                            assetVerb.slice(1),
                        href: [this.lineId, this.assetType],
                    });

                    const displayAsset = currentLine[assetVerb].find(
                        (asset) => {
                            return this.assetId === asset.id;
                        }
                    );

                    if (displayAsset) {
                        this.titleString = displayAsset.displayName;

                        this.breadcrumbsData.push({
                            displayText: this.titleString,
                            href: [this.lineId, this.assetType, this.assetId],
                        });
                    } else {
                        this.titleString =
                            currentLine.displayName +
                            " - " +
                            assetVerb.charAt(0).toUpperCase() +
                            assetVerb.slice(1);
                    }
                } else {
                    this.titleString = currentLine.displayName;
                }
            }
        });
    }

    ngOnDestroy(): void {
        this.routeSubscription?.unsubscribe();
    }
}
