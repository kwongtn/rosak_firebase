import { TimeAxisData } from "ng-devui/time-axis";

import { Component, OnInit } from "@angular/core";

import { severityToDotColor } from "./utils";

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
                description:
                    "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. ",
            },
            {
                id: "2",
                date: "2022-08-31",
                severity: "CRITICAL",
                title: "Test1",
                description: "",
            },
        ],
    };

    timelineData: TimeAxisData = {
        direction: "horizontal",
        horizontalAlign: "left",
        widthMode: "fitContent",
        model: "template",
        list: [],
    };

    constructor() {
        return;
    }

    ngOnInit(): void {
        this.timelineData.list = this.data.vehicleIncidents.map(
            (value, index, arr) => {
                return {
                    lineStyle: {
                        style: index == arr.length - 1 ? "dashed" : "solid",
                        color: "#babbc0",
                    },
                    data: {
                        title: value.title,
                        date: value.date,
                        status: value.severity,
                        color: severityToDotColor(value.severity as any),
                        position: index % 2 ? "top" : "bottom",
                        detail: value.description,
                    },
                };
            }
        );
    }
}
