import { NzBadgeModule } from "ng-zorro-antd/badge";
import { NzCalendarModule } from "ng-zorro-antd/calendar";
import { NzGridModule } from "ng-zorro-antd/grid";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { FormsModule } from "@angular/forms";

import {
    CalendarIncidentSeverityModule,
} from "../pipes/calendar-incident-severity/calendar-incident-severity.module";
import { CalendarComponent } from "./calendar/calendar.component";
import { InsidenMainComponent } from "./insiden.component";

@NgModule({
    declarations: [InsidenMainComponent, CalendarComponent],
    imports: [
        CommonModule,
        FormsModule,

        // ng-zorro
        NzBadgeModule,
        NzCalendarModule,
        NzGridModule,

        // Self-imports
        CalendarIncidentSeverityModule,
    ],
})
export class InsidenModule {}
