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

    filters = {};

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

    ngOnInit(): void {
        this.filters = {
            startDate: formatDate(
                new Date(
                    this.selectedDate.getFullYear(),
                    this.selectedDate.getMonth(),
                    -14
                ),
                DATE_FORMAT,
                this.locale
            ),
            endDate: formatDate(
                new Date(
                    this.selectedDate.getFullYear(),
                    this.selectedDate.getMonth(),
                    +14
                ),
                DATE_FORMAT,
                this.locale
            ),
            groupBy: "DAY",
        };

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
        console.log(`Select value: ${select}`);
        this.selectedDateChange.emit(select);
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
