import { VehicleStatus } from "src/app/models/query/get-vehicles";
import {
    VehicleStatus as SpottingVehicleStatus,
} from "src/app/spotting/spotting-form/spotting-form.types";

import { Pipe, PipeTransform } from "@angular/core";

@Pipe({
    name: "vehicleStatusPipe",
})
export class VehicleStatusPipePipe implements PipeTransform {
    transform(value: VehicleStatus| SpottingVehicleStatus): string {
        const dict = {
            IN_SERVICE: "In Service",
            NOT_SPOTTED: "Not Spotted",
            DECOMMISSIONED: "Decommissioned",
            NOT_IN_SERVICE: "Not in Service",
            OUT_OF_SERVICE: "Out of Service",
            MARRIED: "Married",
            TESTING: "Testing",
            UNKNOWN: "Unknown",
        };

        return dict[value] ?? "Unknown";
    }
}
