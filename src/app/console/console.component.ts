
import { Component, OnInit } from "@angular/core";

import {
    ConsoleEventsTableComponent,
} from "./events-table/events-table.component";

@Component({
    selector: "app-console-main",
    templateUrl: "./console.component.html",
    styleUrls: ["./console.component.scss"],
    standalone: true,
    imports:[ConsoleEventsTableComponent]
})
export class ConsoleMainComponent implements OnInit {
    constructor() {
        return;
    }

    ngOnInit(): void {
        return;
    }

}
