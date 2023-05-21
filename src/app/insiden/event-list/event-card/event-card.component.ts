import { Component, Input, OnDestroy, OnInit } from "@angular/core";

import { CalendarIncidentListItem } from "../event-list.component";
import { getReadableTimeDifference } from "../event-list.component.util";

@Component({
    selector: "insiden-event-card",
    templateUrl: "./event-card.component.html",
    styleUrls: ["./event-card.component.scss"],
})
export class EventCardComponent implements OnInit, OnDestroy {
    @Input() data!: CalendarIncidentListItem;
    displayData!: CalendarIncidentListItem;

    timer: NodeJS.Timer | undefined = undefined;
    elapsedTime: string = "";

    ngOnInit(): void {
        this.displayData = JSON.parse(JSON.stringify(this.data));

        if (this.displayData.chronologies.length === 0) {
            this.displayData.chronologies.push({
                order: "0",
                sourceUrl: "",
                indicator: "blue",
                datetime: this.displayData.startDatetime,
                content: "Start of incident",
            });

            if (this.displayData.endDatetime) {
                this.displayData.chronologies.push({
                    order: "1",
                    sourceUrl: "",
                    indicator: "green",
                    datetime: this.displayData.endDatetime,
                    content: "Issue resolved",
                });
            }
        }

        this.displayData.chronologies = this.displayData.chronologies.map(
            (c) => {
                return {
                    ...c,
                    content: c.content.split("\r\n").join("<br />"),
                };
            }
        );
        this.displayData.chronologies.sort((a, b) => {
            return Number(a.order) - Number(b.order);
        });

        this.displayData.brief = this.displayData.brief
            .split("\r\n")
            .join("<br />");

        if (this.displayData.endDatetime) {
            this.displayData.duration = getReadableTimeDifference(
                new Date(this.displayData.startDatetime),
                new Date(this.displayData.endDatetime)
            );
        } else {
            this.elapsedTime = getReadableTimeDifference(
                new Date(this.displayData.startDatetime),
                new Date()
            );
            // Repeating cause I want it to run immediately first
            this.timer = setInterval(() => {
                this.elapsedTime = getReadableTimeDifference(
                    new Date(this.displayData.startDatetime),
                    new Date()
                );
            }, 200);
        }
    }

    ngOnDestroy(): void {
        if (this.timer) {
            clearInterval(this.timer);
        }
    }
}
