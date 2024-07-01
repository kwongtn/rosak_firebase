import {
    FeatureCollection,
    GeoJsonProperties,
    LineString,
    MultiLineString,
    Point,
} from "geojson";
import { Route } from "gtfs-types";
import JSZip from "jszip";
import { firstValueFrom, Subject } from "rxjs";

import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";

import { Gtfs } from "../map/gtfs-parser";

interface StaticGtfsConfig {
    sourceUrl: string;
}

class StaticGtfs {
    sourceUrl: string;
    isLoading = true;
    stops: FeatureCollection<Point, GeoJsonProperties> = {
        type: "FeatureCollection",
        features: [],
    };
    routes: FeatureCollection<MultiLineString, Route> = {
        type: "FeatureCollection",
        features: [],
    };
    trips: FeatureCollection<LineString, GeoJsonProperties> = {
        type: "FeatureCollection",
        features: [],
    };

    gtfs!: Gtfs;
    zipInstance?: JSZip;

    constructor({ sourceUrl = "" }: StaticGtfsConfig) {
        this.sourceUrl = sourceUrl;
    }

    async setZipInstance(zipInstance: JSZip) {
        this.zipInstance = zipInstance;

        this.gtfs = new Gtfs(this.zipInstance);

        Promise.all([
            this.gtfs.stopsToGeojson(),
            this.gtfs.routesToGeojson(),
            this.gtfs.tripsToGeojson(),
        ]).then(([stops, routes, trips]) => {
            this.stops = stops;
            this.routes = routes;
            this.trips = trips;

            console.log(this.stops);
            console.log(this.routes);
            console.log(this.trips);
            this.isLoading = false;
        });
    }
}

@Injectable({
    providedIn: "root",
})
export class GtfsStaticStateService {
    sources: { [key: string]: StaticGtfs } = {};
    $deletedFeed: Subject<string> = new Subject<string>();
    // $addedFeed: Subject<string> = new Subject<string>();

    constructor(private http: HttpClient) {}

    upsertSourceUrls(
        sources: { [key: string]: StaticGtfsConfig },
        removeUndeclared = true
    ) {
        if (removeUndeclared) {
            Object.keys(this.sources).forEach((sourcename) => {
                if (!sources[sourcename]) {
                    delete this.sources[sourcename];
                    this.$deletedFeed.next(sourcename);
                }
            });
        }

        Object.entries(sources).forEach(([sourcename, config]) => {
            if (!this.sources[sourcename]) {
                // this.$addedFeed.next(sourcename);
                this.sources[sourcename] = new StaticGtfs(config);

                firstValueFrom(
                    this.http.get(config.sourceUrl, {
                        responseType: "arraybuffer",
                    })
                ).then(async (body) => {
                    await this.sources[sourcename].setZipInstance(
                        await JSZip.loadAsync(body)
                    );
                });
            }
        });
    }
}
