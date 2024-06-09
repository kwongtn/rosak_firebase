import { QueryRef } from "apollo-angular";
import { NzCalendarMode } from "ng-zorro-antd/calendar";
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

export interface CalendarIncidentListItem
    extends GetCalendarIncidentListMinResponseElem {
    duration?: string;
}

interface IIntComparisonFilterLookup {
    exact: number;
}

interface CalendarFilterMonth {
    date: {
        exact: string;
    };
}
interface CalendarFilterYear {
    date: {
        month: IIntComparisonFilterLookup;
        year: IIntComparisonFilterLookup;
    };
}

interface VariablesType {
    filters: CalendarFilterMonth | CalendarFilterYear;
    order: {
        startDatetime: "ASC" | "DESC";
    };
}

interface EventListComponentData {
    longTerm: CalendarIncidentListItem[];
    shortTerm: CalendarIncidentListItem[];
}

@Component({
    selector: "insiden-event-list",
    templateUrl: "./event-list.component.html",
    styleUrls: ["./event-list.component.scss"],
})
export class EventListComponent implements OnInit, OnChanges {
    @Input() selectedDate!: Date;
    @Input() calendarMode!: NzCalendarMode;

    panelActive: boolean = false;

    showLoading: boolean = true;
    dataLength: number = 0;
    data: EventListComponentData = {
        shortTerm: [],
        longTerm: [],
    };

    gqlSubscription!: Subscription;
    watchQueryOption!: QueryRef<GetCalendarIncidentListMinResponse>;

    constructor(
        private gqlService: GetCalIncidentListMinService,
        @Inject(LOCALE_ID) private locale: string
    ) {
        return;
    }

    getVariables(): VariablesType {
        const variables: { [key: string]: any } = {
            order: {
                startDatetime: "ASC",
            },
        };
        if (this.calendarMode === "month") {
            // Month view, hence on individual cell selection we will see day view
            variables["filters"] = {
                date: {
                    exact: formatDate(this.selectedDate, DATE_FORMAT, this.locale),
                },
            } as CalendarFilterMonth;
        } else if (this.calendarMode === "year") {
            // Year view, hence on individual cell selection we will see month view
            variables["filters"] = {
                date: {
                    month: { exact: this.selectedDate.getMonth() },
                    year: { exact: this.selectedDate.getFullYear() },
                },
            } as CalendarFilterYear;
        } else {
            throw new Error("Invalid calendar mode");
        }

        return variables as VariablesType;
    }

    setResults(results: GetCalendarIncidentListMinResponse) {
        this.dataLength = results.calendarIncidents.length;
        const selectedDateString = formatDate(
            this.selectedDate,
            DATE_FORMAT,
            this.locale
        );

        this.data = {
            shortTerm: results.calendarIncidents.filter((val) => {
                return (
                    !val.longTerm ||
                    formatDate(
                        new Date(val.startDatetime),
                        DATE_FORMAT,
                        this.locale
                    ) === selectedDateString
                );
            }),
            longTerm: results.calendarIncidents.filter((val) => {
                return (
                    val.longTerm &&
                    formatDate(
                        new Date(val.startDatetime),
                        DATE_FORMAT,
                        this.locale
                    ) !== selectedDateString
                );
            }),
        };
    }

    ngOnInit(): void {
        this.showLoading = true;

        this.watchQueryOption = this.gqlService.watch(this.getVariables());

        this.gqlSubscription = this.watchQueryOption.valueChanges.subscribe(
            ({ data, loading }) => {
                this.showLoading = loading;
                this.setResults(data);
            }
        );
    }

    ngOnChanges(changes: SimpleChanges): void {
        this.showLoading = true;

        if (!this.watchQueryOption) {
            this.watchQueryOption = this.gqlService.watch(this.getVariables());
        }

        this.watchQueryOption
            .fetchMore({
                variables: this.getVariables(),
            })
            .then(({ data, loading }) => {
                this.showLoading = loading;

                this.setResults(data);
            });
    }
}
