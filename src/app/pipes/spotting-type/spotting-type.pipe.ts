import { Pipe, PipeTransform } from "@angular/core";

type SpottingType = "DEPOT" | "LOCATION" | "BETWEEN_STATIONS" | "JUST_SPOTTING";

@Pipe({
    name: "spottingType",
})
export class SpottingTypePipe implements PipeTransform {
    transform(value: SpottingType): string {
        const dict = {
            DEPOT: "Depot",
            LOCATION: "Location",
            BETWEEN_STATIONS: "Between Stations",
            JUST_SPOTTING: "Just Spotting",
        };

        return dict[value];
    }
}
