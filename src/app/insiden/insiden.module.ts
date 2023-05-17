import { NzBadgeModule } from "ng-zorro-antd/badge";
import { NzCalendarModule } from "ng-zorro-antd/calendar";
import { NzCardModule } from "ng-zorro-antd/card";
import { NzEmptyModule } from "ng-zorro-antd/empty";
import { NzGridModule } from "ng-zorro-antd/grid";
import { NzListModule } from "ng-zorro-antd/list";
import { NzSpaceModule } from "ng-zorro-antd/space";
import { NzSpinModule } from "ng-zorro-antd/spin";
import { NzTagModule } from "ng-zorro-antd/tag";
import { NzTimelineModule } from "ng-zorro-antd/timeline";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { FormsModule } from "@angular/forms";

import {
    CalendarIncidentSeverityModule,
} from "../pipes/calendar-incident-severity/calendar-incident-severity.module";
import { CalendarComponent } from "./calendar/calendar.component";
import { EventListComponent } from "./event-list/event-list.component";
import { InsidenMainComponent } from "./insiden.component";

@NgModule({
    declarations: [InsidenMainComponent, CalendarComponent, EventListComponent],
    imports: [
        CommonModule,
        FormsModule,

        // ng-zorro
        NzBadgeModule,
        NzCalendarModule,
        NzCardModule,
        NzEmptyModule,
        NzGridModule,
        NzListModule,
        NzSpaceModule,
        NzSpinModule,
        NzTagModule,
        NzTimelineModule,

        // Self-imports
        CalendarIncidentSeverityModule,
    ],
})
export class InsidenModule {}
