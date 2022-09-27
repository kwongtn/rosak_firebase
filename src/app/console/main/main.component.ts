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

    tableData: ConsoleEventsGqlResponse = {
        eventsLastThreeDays: [],
        eventsLastFiveDaysHasNotes: [],
        eventsLastSevenDaysDifferentStatusThanVehicle: [],
    };

    constructor(private consoleEventsGqlService: ConsoleEventsGqlService) {
        return;
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
                this.tableData = data;
            });
    }

    ngOnDestroy(): void {
        this.eventGqlSubscription?.unsubscribe();
    }
}
