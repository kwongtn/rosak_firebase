import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import {
    CalendarIncidentSeverityPipe,
} from "./calendar-incident-severity.pipe";

@NgModule({
    declarations: [CalendarIncidentSeverityPipe],
    imports: [CommonModule],
    exports: [CalendarIncidentSeverityPipe],
})
export class CalendarIncidentSeverityModule {}
