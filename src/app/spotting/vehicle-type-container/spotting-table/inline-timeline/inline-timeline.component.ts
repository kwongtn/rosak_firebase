import { TimeAxisData } from "ng-devui";

import { Component, OnInit } from "@angular/core";

@Component({
    selector: "app-inline-timeline",
    templateUrl: "./inline-timeline.component.html",
    styleUrls: ["./inline-timeline.component.scss"],
})
export class InlineTimelineComponent implements OnInit {
    data = {
        vehicleIncidents: [
            {
                id: "1",
                date: "2022-08-31",
                severity: "TRIVIA",
                title: "Test1",
                description: "",
            },
            {
                id: "2",
                date: "2022-08-31",
                severity: "TRIVIA",
                title: "Test1",
                description: "",
            },
        ],
    };

    timelineData: TimeAxisData = {
        direction: "horizontal",
        // model: "",
        widthMode: "fitWidth",
        model: "html",
        list: [
            {
                text: "Download",
                time: "2021-07-28",
            },
            {
                text: "Check",
                time: "2021-07-29",
                position: "right",
                dotColor: "var(--devui-success)",
            },
            {
                text: "Build",
                time: "2021-07-30",
                position: "right",
                dotColor: "var(--devui-danger)",
            },
            {
                text: "Depoy",
                time: "2021-07-31",
                position: "right",
                dotColor: "var(--devui-warning)",
            },
            {
                text: "End",
                time: "2021-08-01",
                position: "right",
                dotColor: "var(--devui-waiting)",
                // lineStyle: { style: "none" },
            },
        ],
    };

    constructor() {
        return;
    }

    ngOnInit(): void {
        return;
    }
}
