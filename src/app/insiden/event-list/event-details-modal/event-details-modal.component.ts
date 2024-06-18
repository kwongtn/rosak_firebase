import { NZ_MODAL_DATA, NzModalRef } from "ng-zorro-antd/modal";
import { NzSpinModule } from "ng-zorro-antd/spin";
import { MarkdownComponent } from "ngx-markdown";
import { Subscription } from "rxjs";

import { Component, inject, OnInit } from "@angular/core";

import {
    GetCalIncidentDetailsService,
} from "../../services/get-cal-incident-details.service";
import { CalendarIncidentListItem } from "../event-list.component";

@Component({
    selector: "insiden-event-details-modal",
    templateUrl: "./event-details-modal.component.html",
    styleUrls: ["./event-details-modal.component.scss"],
    standalone: true,
    imports: [MarkdownComponent, NzSpinModule],
})
export class EventDetailsModalComponent implements OnInit {
    readonly nzModalData: CalendarIncidentListItem = inject(NZ_MODAL_DATA);

    showLoading: boolean = true;
    details: string = "";

    gqlSubscription!: Subscription;

    constructor(
        private modal: NzModalRef,
        private gqlService: GetCalIncidentDetailsService
    ) {
        return;
    }

    ngOnInit(): void {
        this.showLoading = true;

        this.gqlSubscription = this.gqlService
            .watch({
                filters: { id: this.nzModalData.id },
            })
            .valueChanges.subscribe(({ data, loading }) => {
                this.showLoading = loading;

                this.details = data.calendarIncidents[0].details;
            });
    }

    destroyModal(): void {
        this.modal.destroy();
        this.gqlSubscription?.unsubscribe();
    }
}
