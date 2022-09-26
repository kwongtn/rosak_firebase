import { Pipe, PipeTransform } from "@angular/core";

type VehicleStatus =
    | "IN_SERVICE"
    | "NOT_SPOTTED"
    | "DECOMMISSIONED"
    | "TESTING"
    | "UNKNOWN";

@Pipe({
    name: "vehicleStatusPipe",
})
export class VehicleStatusPipePipe implements PipeTransform {
    transform(value: VehicleStatus): string {
        const dict = {
            IN_SERVICE: "In Service",
            NOT_SPOTTED: "Not Spotted",
            DECOMMISSIONED: "Decommissioned",
            MARRIED: "Married",
            TESTING: "Testing",
            UNKNOWN: "Unknown",
        };

        return dict[value] ?? "Unknown";
    }
}
