import { NzBadgeModule } from "ng-zorro-antd/badge";
import { NzCalendarModule } from "ng-zorro-antd/calendar";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { FormsModule } from "@angular/forms";

import { CalendarComponent } from "./calendar/calendar.component";
import { InsidenMainComponent } from "./insiden.component";

@NgModule({
    declarations: [InsidenMainComponent, CalendarComponent],
    imports: [CommonModule, FormsModule, NzCalendarModule, NzBadgeModule],
})
export class InsidenModule {}