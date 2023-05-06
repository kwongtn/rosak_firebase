import { Pipe, PipeTransform } from "@angular/core";

@Pipe({
    name: "calendarIncidentSeverity",
})
export class CalendarIncidentSeverityPipe implements PipeTransform {
    transform(severity: string): string {
        const map: { [key: string]: string } = {
            CRITICAL: "error",
            MINOR: "warning",
            MILESTONE: "processing",
        };
        return map[severity] ?? "default";
    }
}
