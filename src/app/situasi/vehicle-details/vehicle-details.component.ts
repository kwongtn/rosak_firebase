import { firstValueFrom } from "rxjs";

import { Component } from "@angular/core";
import { ActivatedRoute } from "@angular/router";

@Component({
    selector: "situasi-vehicle-details",
    templateUrl: "./vehicle-details.component.html",
    styleUrls: ["./vehicle-details.component.scss"],
})
export class VehicleDetailsComponent {
    lineId: string | undefined = undefined;
    vehicleId: string | undefined = undefined;

    constructor(
        private route: ActivatedRoute
    ) {
        firstValueFrom(this.route.params).then((res) => {
            this.lineId = res["lineId"];
            this.vehicleId = res["assetId"];
        });
    }
}
