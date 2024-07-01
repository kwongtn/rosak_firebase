// import { InViewportModule } from "ng-in-viewport";
import { NzBadgeModule } from "ng-zorro-antd/badge";
import { NzButtonModule } from "ng-zorro-antd/button";
import { NzCalendarModule } from "ng-zorro-antd/calendar";
import { NzCardModule } from "ng-zorro-antd/card";
import { NzCollapseModule } from "ng-zorro-antd/collapse";
import { NzEmptyModule } from "ng-zorro-antd/empty";
import { NzGridModule } from "ng-zorro-antd/grid";
import { NzIconModule } from "ng-zorro-antd/icon";
import { NzListModule } from "ng-zorro-antd/list";
import { NzSpaceModule } from "ng-zorro-antd/space";
import { NzSpinModule } from "ng-zorro-antd/spin";
import { NzTagModule } from "ng-zorro-antd/tag";
import { NzTimelineModule } from "ng-zorro-antd/timeline";
import { NzToolTipModule } from "ng-zorro-antd/tooltip";
import { MarkdownModule } from "ngx-markdown";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { FormsModule } from "@angular/forms";

import { ImageGridModule } from "../@ui/image-grid/image-grid.module";
import {
    FormUploadComponent,
} from "../@ui/spotting/form-upload/form-upload.component";
import {
    CalendarIncidentSeverityPipe,
} from "../pipes/calendar-incident-severity/calendar-incident-severity.pipe";
import { CalendarComponent } from "./calendar/calendar.component";
import {
    EventCardComponent,
} from "./event-list/event-card/event-card.component";
import {
    ImageDrawerComponent,
} from "./event-list/event-card/image-drawer/image-drawer.component";
import {
    EventDetailsModalComponent,
} from "./event-list/event-details-modal/event-details-modal.component";
import { EventListComponent } from "./event-list/event-list.component";
import { InsidenMainComponent } from "./insiden.component";

@NgModule({
    declarations: [
        InsidenMainComponent,
        EventListComponent,
        ImageDrawerComponent,
    ],
    imports: [
        CommonModule,
        FormsModule,
        MarkdownModule.forChild(),
        // InViewportModule,

        // ng-zorro
        NzBadgeModule,
        NzButtonModule,
        NzCalendarModule,
        NzCardModule,
        NzCollapseModule,
        NzEmptyModule,
        NzGridModule,
        NzIconModule,
        NzListModule,
        NzSpaceModule,
        NzSpinModule,
        NzTagModule,
        NzTimelineModule,
        NzToolTipModule,

        // Self-imports
        CalendarIncidentSeverityPipe,
        FormUploadComponent,
        ImageGridModule,
        CalendarComponent,
        EventDetailsModalComponent,
        EventCardComponent,
    ],
    providers: [],
})
export class InsidenModule {}
