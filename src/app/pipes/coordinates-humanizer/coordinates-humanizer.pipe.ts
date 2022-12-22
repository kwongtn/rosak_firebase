import { Pipe, PipeTransform } from "@angular/core";

@Pipe({
    name: "coordinatesHumanizer",
})
export class CoordinatesHumanizerPipe implements PipeTransform {
    transform(value: GeolocationCoordinates, toFixedCount: number = 5): string {
        const latSign = value.latitude > 0 ? "N" : "S";
        const lonSign = value.longitude > 0 ? "E" : "W";

        return `${Math.abs(value.latitude).toFixed(
            toFixedCount
        )}${latSign}, ${Math.abs(value.longitude).toFixed(
            toFixedCount
        )}${lonSign} ± ${value.accuracy.toFixed(toFixedCount)}m`;
    }
}
