import { Subscription } from "rxjs";

import { Component, OnDestroy, OnInit } from "@angular/core";

import {
    ConsoleEventsGqlResponse,
    ConsoleEventsGqlService,
} from "../services/events-gql/events-gql.service";

@Component({
    selector: "app-console-main",
    templateUrl: "./main.component.html",
    styleUrls: ["./main.component.scss"],
})
export class ConsoleMainComponent implements OnInit, OnDestroy {
    eventGqlSubscription!: Subscription;
    showLoading = true;

    tableData: ConsoleEventsGqlResponse = {
        eventsLastThreeDays: [],
        eventsLastFiveDaysHasNotes: [],
        eventsLastSevenDaysDifferentStatusThanVehicle: [],
    };

    panelCollapseStatus: { [key: string]: boolean } = {
        eventsLastThreeDays: false,
        eventsLastFiveDaysHasNotes: false,
        eventsLastSevenDaysDifferentStatusThanVehicle: false,
    };

    constructor(private consoleEventsGqlService: ConsoleEventsGqlService) {
        return;
    }

    toggle(key: string) {
        this.panelCollapseStatus[key] = !this.panelCollapseStatus[key];
    }

    ngOnInit(): void {
        this.eventGqlSubscription = this.consoleEventsGqlService
            .watch({
                eventsLastThreeDaysFilters: {
                    daysBefore: 3,
                },
                eventsLastFiveDaysHasNotesFilters: {
                    daysBefore: 5,
                    hasNotes: true,
                },
                eventsLastSevenDaysDifferentStatusThanVehicleFilters: {
                    daysBefore: 7,
                    differentStatusThanVehicle: true,
                },
            })
            .valueChanges.subscribe(({ data, loading }) => {
                this.showLoading = loading;
                this.tableData = data;
            });
    }

    ngOnDestroy(): void {
        this.eventGqlSubscription?.unsubscribe();
    }
}
