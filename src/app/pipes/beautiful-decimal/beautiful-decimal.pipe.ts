import { Pipe, PipeTransform } from "@angular/core";

@Pipe({
    name: "beautifulDecimal",
    standalone: true,
})
export class BeautifulDecimalPipe implements PipeTransform {
    transform(value: number, precision: number = 5): string {
        return value.toPrecision(precision).replace(/\.?0+$/, "");
    }
}
