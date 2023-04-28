import { VehicleStatus } from "src/app/models/query/get-vehicles";

import { Pipe, PipeTransform } from "@angular/core";

@Pipe({
    name: "vehicleStatusPipe",
})
export class VehicleStatusPipePipe implements PipeTransform {
    transform(value: VehicleStatus): string {
        const dict = {
            IN_SERVICE: "In Service",
            NOT_SPOTTED: "Not Spotted",
            DECOMMISSIONED: "Decommissioned",
            NOT_IN_SERVICE: "Not in Service",
            MARRIED: "Married",
            TESTING: "Testing",
            UNKNOWN: "Unknown",
        };

        return dict[value] ?? "Unknown";
    }
}
