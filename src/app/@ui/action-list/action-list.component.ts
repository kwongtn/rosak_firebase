import { NzListModule } from "ng-zorro-antd/list";
import { NzMessageService } from "ng-zorro-antd/message";
import { NzSpaceModule } from "ng-zorro-antd/space";
import {
    SessionHistoryService,
} from "src/app/services/session-history.service";
import { environment } from "src/environments/environment";

import { CommonModule } from "@angular/common";
import { Component, Input } from "@angular/core";

import {
    SpottingTypeTagModule,
} from "../spotting-type-tag/spotting-type-tag.module";
import {
    VehicleStatusTagModule,
} from "../vehicle-status-tag/vehicle-status-tag.module";

@Component({
    selector: "ui-action-list",
    templateUrl: "./action-list.component.html",
    styleUrls: ["./action-list.component.scss"],
    standalone: true,
    imports: [
        CommonModule,
        NzListModule,
        NzSpaceModule,
        SpottingTypeTagModule,
        VehicleStatusTagModule,
    ],
})
export class ActionListComponent {
    @Input() filter: string[] = ["spotting"];
    backendUrl: string = environment.backendUrl;

    constructor(
        public msg: NzMessageService,
        public sessionHistoryService: SessionHistoryService
    ) {}
}
