import { NzCalendarMode } from "ng-zorro-antd/calendar";

import { Component } from "@angular/core";

@Component({
    selector: "app-insiden-main",
    templateUrl: "./insiden.component.html",
    styleUrls: ["./insiden.component.scss"],
})
export class InsidenMainComponent {
    selectedDate: Date = new Date();
    calendarMode: NzCalendarMode = "month";
}
