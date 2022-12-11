import { Subscription } from "rxjs";
import { AuthService } from "src/app/services/auth/auth.service";

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

    toggleMarkAsRead = false;

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

    constructor(
        private consoleEventsGqlService: ConsoleEventsGqlService,
        private authService: AuthService
    ) {
        return;
    }

    toggle(key: string) {
        this.panelCollapseStatus[key] = !this.panelCollapseStatus[key];
    }

    async ngOnInit(): Promise<void> {
        this.eventGqlSubscription = this.consoleEventsGqlService
            .watch(
                {
                    eventsLastThreeDaysFilters: {
                        isRead: false,
                        daysBefore: 3,
                    },
                    eventsLastFiveDaysHasNotesFilters: {
                        isRead: false,
                        daysBefore: 5,
                        hasNotes: true,
                    },
                    eventsLastSevenDaysDifferentStatusThanVehicleFilters: {
                        isRead: false,
                        daysBefore: 7,
                        differentStatusThanVehicle: true,
                    },
                },
                {
                    context: {
                        headers: {
                            "firebase-auth-key":
                                await this.authService.getIdToken(),
                        },
                    },
                }
            )
            .valueChanges.subscribe(({ data, loading }) => {
                this.showLoading = loading;
                this.tableData = data;
            });
    }

    ngOnDestroy(): void {
        this.eventGqlSubscription?.unsubscribe();
    }

    clickSwitch() {
        this.toggleMarkAsRead = !this.toggleMarkAsRead;
    }
}
