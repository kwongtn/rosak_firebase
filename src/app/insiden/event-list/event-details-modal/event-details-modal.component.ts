import { NzModalRef } from "ng-zorro-antd/modal";

import { Component } from "@angular/core";

@Component({
    selector: "insiden-event-details-modal",
    templateUrl: "./event-details-modal.component.html",
    styleUrls: ["./event-details-modal.component.scss"],
})
export class EventDetailsModalComponent {
    constructor(private modal: NzModalRef) {}

    destroyModal(): void {
        this.modal.destroy();
    }
}
