import { QueryRef } from "apollo-angular";
import { NzCalendarMode } from "ng-zorro-antd/calendar";
import { Subscription } from "rxjs";

import { formatDate } from "@angular/common";
import {
    Component,
    EventEmitter,
    Inject,
    Input,
    LOCALE_ID,
    OnInit,
    Output,
} from "@angular/core";

import {
    GetCalendarIncidentListMonthResponseElem,
    GetCalIncidentListMonthService,
} from "../services/get-cal-incident-list-month.service";

export interface IncidentCounts {
    count: number;
}

const DATE_FORMAT = "yyyy-MM-dd";

@Component({
    selector: "insiden-calendar",
    templateUrl: "./calendar.component.html",
    styleUrls: ["./calendar.component.scss"],
})
export class CalendarComponent implements OnInit {
    @Input() selectedDate!: Date;
    @Output() selectedDateChange = new EventEmitter<Date>();

    showLoading: boolean = true;

    gqlSubscription!: Subscription;
    watchQueryOption!: QueryRef<any>;

    filters: { [key: string]: string } = {};

    listDataMap = {
        eight: [
            { type: "warning", content: "This is warning event." },
            { type: "success", content: "This is usual event." },
        ],
    };

    // Date -> Severity -> Count
    monthEvents: {
        [date: string]: {
            [severity: string]: number;
        };
    } = {};

    constructor(
        private gqlService: GetCalIncidentListMonthService,
        @Inject(LOCALE_ID) private locale: string
    ) {
        return;
    }

    getFilters(date: Date): { [key: string]: string } {
        return {
            startDate: formatDate(
                new Date(date.getFullYear(), date.getMonth(), -14),
                DATE_FORMAT,
                this.locale
            ),
            endDate: formatDate(
                new Date(date.getFullYear(), date.getMonth() + 1, 14),
                DATE_FORMAT,
                this.locale
            ),
            groupBy: "DAY",
        };
    }

    ngOnInit(): void {
        this.filters = this.getFilters(this.selectedDate);
        this.watchQueryOption = this.gqlService.watch({
            ...this.filters,
        });

        this.gqlSubscription = this.watchQueryOption.valueChanges.subscribe(
            ({ data, loading }) => {
                this.showLoading = loading;

                data.calendarIncidentsBySeverityCount.forEach(
                    (elem: GetCalendarIncidentListMonthResponseElem) => {
                        if (this.monthEvents[elem.date]) {
                            this.monthEvents[elem.date][elem.severity] =
                                elem.count;
                        } else {
                            this.monthEvents[elem.date] = {
                                [elem.severity]: elem.count,
                            };
                        }
                    }
                );
            }
        );
    }

    selectChange(select: Date): void {
        const newFilter = this.getFilters(select);

        this.selectedDateChange.emit(select);
        if (
            this.filters["startDate"] !== newFilter["startDate"] ||
            this.filters["endDate"] !== newFilter["endDate"]
        ) {
            this.filters = newFilter;
            this.showLoading = true;

            this.watchQueryOption
                .fetchMore({
                    variables: {
                        ...this.filters,
                    },
                })
                .then(({ data, loading }) => {
                    this.showLoading = loading;

                    data.calendarIncidentsBySeverityCount.forEach(
                        (elem: GetCalendarIncidentListMonthResponseElem) => {
                            if (this.monthEvents[elem.date]) {
                                this.monthEvents[elem.date][elem.severity] =
                                    elem.count;
                            } else {
                                this.monthEvents[elem.date] = {
                                    [elem.severity]: elem.count,
                                };
                            }
                        }
                    );
                });
        }
    }

    panelChange($event: { date: Date; mode: NzCalendarMode }): void {
        console.log("Panel value", $event);
    }

    getMonthData(date: Date): number | null {
        if (date.getMonth() === 8) {
            return 1394;
        }
        return null;
    }
}
