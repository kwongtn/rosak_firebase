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
    SimpleChanges,
} from "@angular/core";

import {
    GetCalendarIncidentListMinResponse,
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
    watchQueryOption!: QueryRef<GetCalendarIncidentListMinResponse>;

    constructor(
        private gqlService: GetCalIncidentListMinService,
        @Inject(LOCALE_ID) private locale: string
    ) {
        return;
    }

    ngOnInit(): void {
        this.gqlSubscription = this.watchQueryOption.valueChanges.subscribe(
            ({ data, loading }) => {
                this.showLoading = loading;
                this.data = data.calendarIncidents;
            }
        );
    }

    ngOnChanges(changes: SimpleChanges): void {
        this.showLoading = true;

        this.watchQueryOption = this.gqlService.watch({
            filters: {
                date: formatDate(this.selectedDate, DATE_FORMAT, this.locale),
            },
        });

        this.watchQueryOption
            .fetchMore({
                variables: {
                    filters: {
                        date: formatDate(
                            this.selectedDate,
                            DATE_FORMAT,
                            this.locale
                        ),
                    },
                },
            })
            .then(({ data, loading }) => {
                this.showLoading = loading;

                data.calendarIncidents.forEach((calIncident) => {
                    if (calIncident.chronologies.length === 0) {
                        calIncident.chronologies.push({
                            order: "0",
                            indicator: "blue",
                            datetime: calIncident.startDatetime,
                            content: "Start of incident",
                        });

                        if (calIncident.endDatetime) {
                            calIncident.chronologies.push({
                                order: "1",
                                indicator: "green",
                                datetime: calIncident.endDatetime,
                                content: "Issue resolved",
                            });
                        }
                    }

                    calIncident.chronologies = calIncident.chronologies.map(
                        (c) => {
                            return {
                                ...c,
                                content: c.content.split("\r\n").join("<br />"),
                            };
                        }
                    );
                    calIncident.brief = calIncident.brief
                        .split("\r\n")
                        .join("<br />");
                });
                this.data = data.calendarIncidents;
            });
    }
}
