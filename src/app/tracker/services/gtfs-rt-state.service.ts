import { transit_realtime } from "gtfs-realtime-bindings";
import { BehaviorSubject, Subject } from "rxjs";

import { Injectable } from "@angular/core";

import { IFeedEntity } from "../types";

export interface RtGtfsConfig {
    sourceUrl: string;
    intervalMs?: number;
}

class RtGtfs {
    intervalMs: number;
    sourceUrl: string;

    lastUpdatedMs!: number;
    interval!: NodeJS.Timeout;
    feedEntities: BehaviorSubject<IFeedEntity> =
        new BehaviorSubject<IFeedEntity>({});

    percentageTimeRemainingInterval!: NodeJS.Timeout;
    percentageTimeRemaining: BehaviorSubject<number> =
        new BehaviorSubject<number>(0);
    timeRemaining: BehaviorSubject<number> = new BehaviorSubject<number>(0);

    isLoading = false;

    constructor({ sourceUrl = "", intervalMs = 30000 }: RtGtfsConfig) {
        this.intervalMs = intervalMs;

        if (!sourceUrl) {
            throw new Error("No sourceUrl provided");
        }
        this.sourceUrl = sourceUrl;
    }

    async refreshGtfsData() {
        this.isLoading = true;
        const feedEntities = { ...this.feedEntities.getValue() };

        try {
            const res = await fetch(this.sourceUrl);
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
        this.isLoading = false;
        this.lastUpdatedMs = new Date().valueOf();
    }

    async startIntervalRefresh(intervalMs?: number) {
        this.intervalMs = intervalMs ?? this.intervalMs;

        this.interval = setInterval(() => {
            this.refreshGtfsData();
        }, this.intervalMs);

        this.percentageTimeRemainingInterval = setInterval(() => {
            const timeRemaining =
                this.intervalMs - (new Date().valueOf() - this.lastUpdatedMs);
            this.timeRemaining.next(timeRemaining / 1000);
            this.percentageTimeRemaining.next(
                (timeRemaining * 100) / this.intervalMs
            );
        }, 120);

        this.refreshGtfsData();
    }

    async stopIntervalRefresh() {
        clearInterval(this.interval);
        clearInterval(this.percentageTimeRemainingInterval);
    }
}

@Injectable({
    providedIn: "root",
})
export class GtfsRtStateService {
    sources: { [key: string]: RtGtfs } = {};
    $deletedFeed: Subject<string> = new Subject<string>();
    $addedFeed: Subject<string> = new Subject<string>();

    constructor() {}

    upsertSourceUrls(
        sources: { [key: string]: RtGtfsConfig },
        removeUndeclared = true
    ) {
        if (removeUndeclared) {
            Object.keys(this.sources).forEach((sourcename) => {
                if (!sources[sourcename]) {
                    this.sources[sourcename].stopIntervalRefresh();
                    delete this.sources[sourcename];
                    this.$deletedFeed.next(sourcename);
                }
            });
        }

        Object.entries(sources).forEach(([sourcename, config]) => {
            if (!this.sources[sourcename]) {
                this.sources[sourcename] = new RtGtfs(config);
                this.sources[sourcename].startIntervalRefresh();
                this.$addedFeed.next(sourcename);
            }
        });
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
