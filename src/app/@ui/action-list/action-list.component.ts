import { NzMessageService } from "ng-zorro-antd/message";
import {
    SessionHistoryService,
} from "src/app/services/session-history/session-history.service";
import { environment } from "src/environments/environment";

import { Component, Input } from "@angular/core";

@Component({
    selector: "ui-action-list",
    templateUrl: "./action-list.component.html",
    styleUrls: ["./action-list.component.scss"],
})
export class ActionListComponent {
    @Input() filter: string[] = ["spotting"];
    backendUrl: string = environment.backendUrl;

    constructor(
        public msg: NzMessageService,
        public sessionHistoryService: SessionHistoryService
    ) {}
}
