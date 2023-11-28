import { Subscription } from "rxjs";

import { Component, OnDestroy } from "@angular/core";
import { ActivatedRoute } from "@angular/router";

@Component({
    selector: "situasi-vehicle-details",
    templateUrl: "./vehicle-details.component.html",
    styleUrls: ["./vehicle-details.component.scss"],
})
export class VehicleDetailsComponent implements OnDestroy {
    lineId: string | undefined = undefined;
    vehicleId: string | undefined = undefined;

    routeSubscription!: Subscription;

    constructor(private route: ActivatedRoute) {
        this.routeSubscription = this.route.params.subscribe((params) => {
            this.lineId = params["lineId"];
            this.vehicleId = params["assetId"];
        });
    }
    ngOnDestroy(): void {
        this.routeSubscription?.unsubscribe();
    }
}
