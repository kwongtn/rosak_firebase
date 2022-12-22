import { Subscription } from "rxjs";

import { Component, OnInit } from "@angular/core";

import {
    ConsoleEventsGqlResponse,
} from "../services/events-gql/events-gql.service";

@Component({
    selector: "app-console-main",
    templateUrl: "./main.component.html",
    styleUrls: ["./main.component.scss"],
})
export class ConsoleMainComponent implements OnInit {
    eventGqlSubscription!: Subscription;
    toggleMarkAsRead = false;

    tableData: ConsoleEventsGqlResponse = {
        events: [],
    };

    panelCollapseStatus: { [key: string]: boolean } = {
        events: false,
    };

    constructor() {
        return;
    }

    toggle(key: string) {
        this.panelCollapseStatus[key] = !this.panelCollapseStatus[key];
    }

    ngOnInit(): void {
        return;
    }

    onToggleChange(event: boolean) {
        this.toggleMarkAsRead = event;
    }
}
