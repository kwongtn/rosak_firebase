import { transit_realtime } from "gtfs-realtime-bindings";

import { Component, OnInit } from "@angular/core";

@Component({
    selector: "app-tracker",
    templateUrl: "./tracker.component.html",
    styleUrl: "./tracker.component.scss",
})
export class TrackerComponent implements OnInit {
    feedEntities: {
        [key: string]: transit_realtime.IVehiclePosition | null | undefined;
    } = {};

    async refreshGtfsData() {
        const feedEntities = { ...this.feedEntities };

        try {
            const res = await fetch(
                "https://api.data.gov.my/gtfs-realtime/vehicle-position/ktmb/"
            );
            if (!res.ok) {
                const error = new Error(
                    `${res.url}: ${res.status} ${res.statusText}`
                );
                console.log(error);
            }
            const buffer = await res.arrayBuffer();
            const feed = transit_realtime.FeedMessage.decode(
                new Uint8Array(buffer)
            );
            feed.entity.forEach((entity) => {
                // console.log("entity: ", entity);
                if (entity.tripUpdate) {
                    console.log(entity.tripUpdate);
                }
                feedEntities[entity.vehicle?.vehicle?.id ?? ""] =
                    entity.vehicle;
            });
        } catch (error) {
            console.log(error);
        }

        this.feedEntities = feedEntities;
    }

    async ngOnInit() {
        setInterval(() => {
            this.refreshGtfsData();
        }, 30000);

        this.refreshGtfsData();
    }
}
