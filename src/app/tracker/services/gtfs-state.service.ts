import { transit_realtime } from "gtfs-realtime-bindings";
import { BehaviorSubject } from "rxjs";

import { Injectable } from "@angular/core";

import { IFeedEntity } from "../types";

class RtGtfs {
    lastUpdatedMs!: number;
    intervalMs!: number;
    interval!: NodeJS.Timeout;
    feedEntities: BehaviorSubject<IFeedEntity> =
        new BehaviorSubject<IFeedEntity>({});

    constructor(private readonly config: { [key: string]: any }) {}

    get timeRemaining() {
        return this.intervalMs - new Date().valueOf() - this.lastUpdatedMs;
    }

    get percentageTimeRemaining() {
        return this.lastUpdatedMs / this.intervalMs;
    }

    async refreshGtfsData() {
        const feedEntities = { ...this.feedEntities.getValue() };

        try {
            const res = await fetch(this.config["sourceUrl"]);
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

        this.feedEntities.next(feedEntities);
        this.lastUpdatedMs = new Date().valueOf();
    }

    async startIntervalRefresh(intervalMs: number) {
        this.intervalMs = intervalMs;

        this.interval = setInterval(() => {
            this.refreshGtfsData();
        }, this.intervalMs);

        this.refreshGtfsData();
    }

    async stopIntervalRefresh() {
        clearInterval(this.interval);
    }
}

@Injectable({
    providedIn: "root",
})
export class GtfsStateService {
    sources: { [key: string]: RtGtfs } = {};

    constructor() {}

    addSourceUrl(...sources: { [key: string]: any }[]) {
        for (const source of sources) {
            if (!this.sources[source["name"]]) {
                this.sources[source["name"]] = new RtGtfs(source);
            }
        }
    }

    startAllIntervalRefresh(intervalMs: number) {
        for (const sourceUrl of Object.keys(this.sources)) {
            this.sources[sourceUrl].startIntervalRefresh(intervalMs);
        }
    }

    stopAllIntervalRefresh() {
        for (const sourceUrl of Object.keys(this.sources)) {
            this.sources[sourceUrl].stopIntervalRefresh();
        }
    }
}
