import { Pipe, PipeTransform } from "@angular/core";

@Pipe({
    name: "coordinatesHumanizer",
})
export class CoordinatesHumanizerPipe implements PipeTransform {
    transform(value: GeolocationCoordinates): string {
        console.log(value);
        const latSign = value.latitude > 0 ? "N" : "S";
        const lonSign = value.longitude > 0 ? "E" : "W";

        return `${Math.abs(value.latitude)}${latSign}, ${Math.abs(
            value.longitude
        )}${lonSign} ± ${value.accuracy}m`;
    }
}
