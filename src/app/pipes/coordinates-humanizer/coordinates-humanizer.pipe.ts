import { Pipe, PipeTransform } from "@angular/core";

@Pipe({
    name: "coordinatesHumanizer",
})
export class CoordinatesHumanizerPipe implements PipeTransform {
    transform(value: GeolocationCoordinates): string {
        console.log(value);
        const latSign = value.latitude > 0 ? "N" : "S";
        const lonSign = value.longitude > 0 ? "E" : "W";

        return `${Math.abs(value.latitude).toFixed(5)}${latSign}, ${Math.abs(
            value.longitude
        ).toFixed(5)}${lonSign} ± ${value.accuracy.toFixed(5)}m`;
    }
}
