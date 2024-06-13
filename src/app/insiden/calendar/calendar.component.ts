import { QueryRef } from "apollo-angular";
import { NzBadgeModule } from "ng-zorro-antd/badge";
import { NzCalendarMode, NzCalendarModule } from "ng-zorro-antd/calendar";
import { NzSpinModule } from "ng-zorro-antd/spin";
import { NzToolTipModule } from "ng-zorro-antd/tooltip";
import { Subscription } from "rxjs";
import {
    CalendarIncidentSeverityPipe,
} from "src/app/pipes/calendar-incident-severity/calendar-incident-severity.pipe";

import { CommonModule, formatDate } from "@angular/common";
import {
    Component,
    EventEmitter,
    Inject,
    Input,
    LOCALE_ID,
    OnInit,
    Output,
} from "@angular/core";
import { FormsModule } from "@angular/forms";

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
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        NzBadgeModule,
        NzCalendarModule,
        CalendarIncidentSeverityPipe,
        NzToolTipModule,
        NzSpinModule,
    ],
})
export class CalendarComponent implements OnInit {
    @Input() selectedDate!: Date;
    @Output() selectedDateChange = new EventEmitter<Date>();

    @Input() calendarMode!: NzCalendarMode;
    @Output() calendarModeChange = new EventEmitter<NzCalendarMode>();

    showLoading: boolean = true;

    gqlSubscription!: Subscription;
    watchQueryOption!: QueryRef<any>;

    filters: { [key: string]: string } = {};

    // Date -> Severity -> Count
    monthEvents: {
        [date: string]: {
            [severity: string]: {
                isLongTerm: boolean;
                count: number;
            };
        };
    } = {};
    yearEvents: {
        [monthYear: string]: {
            [severity: string]: number;
        };
    } = {};

    constructor(
        private gqlService: GetCalIncidentListMonthService,
        @Inject(LOCALE_ID) private locale: string
    ) {
        return;
    }

    getFilters(date: Date, groupBy: string = "DAY"): { [key: string]: string } {
        let startDate = new Date();
        let endDate = new Date();

        if (groupBy === "DAY") {
            startDate = new Date(date.getFullYear(), date.getMonth(), -14);
            endDate = new Date(date.getFullYear(), date.getMonth() + 1, 14);
        } else if (groupBy === "MONTH") {
            startDate = new Date(date.getFullYear(), 0, 1);
            endDate = new Date(date.getFullYear(), date.getMonth() + 1, 14);
        } else {
            console.error(
                `Invalid groupBy ${groupBy}, expected 'DAY' or 'MONTH'`
            );
        }

        return {
            groupBy,
            startDate: formatDate(startDate, DATE_FORMAT, this.locale),
            endDate: formatDate(endDate, DATE_FORMAT, this.locale),
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
                            this.monthEvents[elem.date][elem.severity] = {
                                count: elem.count,
                                isLongTerm: elem.isLongTerm,
                            };
                        } else {
                            this.monthEvents[elem.date] = {
                                [elem.severity]: {
                                    count: elem.count,
                                    isLongTerm: elem.isLongTerm,
                                },
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
                                this.monthEvents[elem.date][elem.severity] = {
                                    count: elem.count,
                                    isLongTerm: elem.isLongTerm,
                                };
                            } else {
                                this.monthEvents[elem.date] = {
                                    [elem.severity]: {
                                        count: elem.count,
                                        isLongTerm: elem.isLongTerm,
                                    },
                                };
                            }
                        }
                    );
                });
        }
    }

    panelChange($event: { date: Date; mode: NzCalendarMode }): void {
        console.log("Panel value", $event);
        this.calendarModeChange.emit($event.mode);

        if ($event.mode !== this.calendarMode) {
            this.calendarMode = $event.mode;
            this.filters = this.getFilters(
                $event.date,
                $event.mode === "year" ? "MONTH" : "DAY"
            );
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
                            const [year, month, day] = elem.date.split("-");
                            const key = `${year}-${month}`;
                            if (this.yearEvents[key]) {
                                this.yearEvents[key][elem.severity] =
                                    elem.count;
                            } else {
                                this.yearEvents[key] = {
                                    [elem.severity]: elem.count,
                                };
                            }
                        }
                    );
                });
        }
    }

    getMonthData(date: Date): number | null {
        if (date.getMonth() === 8) {
            return 1394;
        }
        return null;
    }
}
