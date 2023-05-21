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

interface CalendarFilterMonth {
    date: string;
}
interface CalendarFilterYear {
    startDate: string;
    endDate: string;
}

interface VariablesType {
    filters: CalendarFilterMonth | CalendarFilterYear;
    order: {
        startDatetime: "ASC" | "DESC";
    };
}

@Component({
    selector: "insiden-event-list",
    templateUrl: "./event-list.component.html",
    styleUrls: ["./event-list.component.scss"],
})
export class EventListComponent implements OnInit, OnChanges {
    @Input() selectedDate!: Date;
    @Input() calendarMode!: NzCalendarMode;

    showLoading: boolean = true;
    data: CalendarIncidentListItem[] = [];

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
            variables["filters"] = {
                date: formatDate(this.selectedDate, DATE_FORMAT, this.locale),
            };
        } else if (this.calendarMode === "year") {
            const firstDay = new Date(
                this.selectedDate.getFullYear(),
                this.selectedDate.getMonth(),
                1
            );
            const lastDay = new Date(
                this.selectedDate.getFullYear(),
                this.selectedDate.getMonth() + 1,
                0
            );
            variables["filters"] = {
                startDate: formatDate(firstDay, DATE_FORMAT, this.locale),
                endDate: formatDate(lastDay, DATE_FORMAT, this.locale),
            };
        } else {
            throw new Error("Invalid calendar mode");
        }

        return variables as VariablesType;
    }

    ngOnInit(): void {
        this.showLoading = true;

        this.watchQueryOption = this.gqlService.watch(this.getVariables());

        this.gqlSubscription = this.watchQueryOption.valueChanges.subscribe(
            ({ data, loading }) => {
                this.showLoading = loading;
                this.data = data.calendarIncidents;
            }
        );
    }

    ngOnChanges(changes: SimpleChanges): void {
        this.showLoading = true;

        this.watchQueryOption
            .fetchMore({
                variables: this.getVariables(),
            })
            .then(({ data, loading }) => {
                this.showLoading = loading;

                this.data = data.calendarIncidents;
            });
    }
}
