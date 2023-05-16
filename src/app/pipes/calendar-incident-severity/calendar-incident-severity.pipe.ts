import { Pipe, PipeTransform } from "@angular/core";

@Pipe({
    name: "calendarIncidentSeverity",
})
export class CalendarIncidentSeverityPipe implements PipeTransform {
    transform(severity: string, returnType: "type" | "color" = "type"): string {
        const typeMap: { [key: string]: string } = {
            MAJOR: "error",
            MINOR: "warning",
            OTHERS: "processing",
        };
        const colorMap: { [key: string]: string } = {
            MAJOR: "red",
            MINOR: "yellow",
            OTHERS: "blue",
        };

        if (returnType === "type") {
            return typeMap[severity] ?? "default";
        } else if (returnType === "color") {
            return colorMap[severity] ?? "cyan";
        } else {
            return severity;
        }
    }
}
