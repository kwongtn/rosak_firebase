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

    // Pagination
    limit = 30;
    offset = 0;

    tableData: ConsoleEventsGqlResponse = {
        events: [],
    };

    panelCollapseStatus: { [key: string]: boolean } = {
        events: false,
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
                    eventFilters: {
                        isRead: false,
                    },
                    eventOrder: {
                        created: "DESC",
                    },
                    eventPagination: {
                        limit: this.limit,
                        offset: this.offset,
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

    onToggleChange(event: boolean) {
        this.toggleMarkAsRead = event;
    }
}
