import { firstValueFrom } from "rxjs";

import { Component } from "@angular/core";
import { ActivatedRoute } from "@angular/router";

@Component({
    selector: "situasi-vehicles",
    templateUrl: "./vehicles.component.html",
    styleUrls: ["./vehicles.component.scss"],
})
export class VehiclesComponent {
    lineId: string | undefined = undefined;

    constructor(private route: ActivatedRoute) {
        firstValueFrom(this.route.params).then((res) => {
            this.lineId = res["lineId"];
        });
    }
}
