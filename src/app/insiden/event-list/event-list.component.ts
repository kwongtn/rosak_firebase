import { QueryRef } from "apollo-angular";
import { Subscription } from "rxjs";

import { formatDate } from "@angular/common";
import {
    Component,
    Inject,
    Input,
    LOCALE_ID,
    OnChanges,
    OnInit,
} from "@angular/core";

import {
    GetCalendarIncidentListMinResponseElem,
    GetCalIncidentListMinService,
} from "../services/get-cal-incident-list-min.service";

const DATE_FORMAT = "yyyy-MM-dd";

@Component({
    selector: "insiden-event-list",
    templateUrl: "./event-list.component.html",
    styleUrls: ["./event-list.component.scss"],
})
export class EventListComponent implements OnInit, OnChanges {
    @Input() selectedDate!: Date;
    showLoading: boolean = true;
    data: GetCalendarIncidentListMinResponseElem[] = [];

    gqlSubscription!: Subscription;
    watchQueryOption!: QueryRef<any>;

    constructor(
        private gqlService: GetCalIncidentListMinService,
        @Inject(LOCALE_ID) private locale: string
    ) {
        return;
    }

    ngOnInit(): void {
        this.watchQueryOption = this.gqlService.watch({
            filters: {
                date: formatDate(this.selectedDate, DATE_FORMAT, this.locale),
            },
        });

        this.gqlSubscription = this.watchQueryOption.valueChanges.subscribe(
            ({ data, loading }) => {
                this.showLoading = loading;
                console.log(data.calendarIncidents);
                this.data = data.calendarIncidents;
            }
        );
    }

    ngOnChanges(): void {
        return;
    }
}
