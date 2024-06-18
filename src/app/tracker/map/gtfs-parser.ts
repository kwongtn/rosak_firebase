import csvtojson from "csvtojson";
import {
    FeatureCollection,
    GeoJsonProperties,
    LineString,
    MultiLineString,
    Point,
} from "geojson";
import JSZip from "jszip";

import type { Route, Shapes, Stop, Trip } from "gtfs-types";
/**
 * Adapted from
 * https://www.npmjs.com/package/gtfs-parser
 */
export class Gtfs {
    zipEntries!: {
        [key: string]: JSZip.JSZipObject;
    };
    zipInstance!: JSZip;

    constructor(zipInstance: JSZip) {
        this.zipInstance = zipInstance;
        this.zipEntries = zipInstance.files;
    }

    private colParser = {
        id: "string",
        service_id: "string",
        route_id: "string",
        route_short_name: "string",
        route_long_name: "string",
        network_id: "string",
        route_text_color: "string",
        route_color: "string",
        shape_id: "string",
        stop_id: "string",
        stop_code: "string",
        tc_agency_id: "string",
        stop_name: "string",
        tts_stop_name: "string",
        stop_desc: "string",
        zone_id: "string",
        stop_url: "string",
        parent_station: "string",
        stop_timezone: "string",
        level_id: "string",
        platform_code: "string",
        from_stop_id: "string",
        to_stop_id: "string",
        from_route_id: "string",
        to_route_id: "string",
        from_trip_id: "string",
        to_trip_id: "string",
        trip_id: "string",
        trip_headsign: "string",
        trip_short_name: "string",
        block_id: "string",
        bikes_allowed: "string",
    };

    public async fileParser(fileName: string) {
        console.log(fileName);
        console.log(this.zipEntries);
        try {
            const fileContents =
                await this.zipEntries[fileName].async("string");
            return await csvtojson({
                colParser: this.colParser,
                checkType: true,
                ignoreEmpty: true,
            })
                .fromString(fileContents)
                .then((json: any) => {
                    const newArr: any[] = [];
                    for (const item of json) {
                        newArr.push(item);
                    }
                    return newArr;
                });
        } catch (e) {
            console.error(e);
            throw new Error(`Issue with parser for ${fileName}`);
        }
    }

    public async tripsToGeojson(): Promise<
        FeatureCollection<LineString, GeoJsonProperties>
        > {
        const shapes: { [k: string]: Shapes[] } = (
            await this.fileParser("shapes.txt")
        ).reduce((memo: { [k: string]: Shapes[] }, row: Shapes) => {
            memo[row.shape_id] = (memo[row.shape_id] || []).concat(row);
            return memo;
        }, {});
        return {
            type: "FeatureCollection",
            features: Object.keys(shapes).map((id) => {
                return {
                    type: "Feature",
                    id: id,
                    properties: {
                        shape_id: id,
                    },
                    geometry: {
                        type: "LineString",
                        coordinates: shapes[id]
                            .sort((a, b) => {
                                return (
                                    +a.shape_pt_sequence - b.shape_pt_sequence
                                );
                            })
                            .map((coord) => {
                                return [coord.shape_pt_lon, coord.shape_pt_lat];
                            }),
                    },
                };
            }),
        };
    }

    public async routesToGeojson() {
        const tripFeatureCollection = await this.tripsToGeojson();
        const routes = await this.fileParser("routes.txt");
        const trips = await this.fileParser("trips.txt");

        const routeFeaturesCollection: FeatureCollection<
            MultiLineString,
            Route
        > = {
            type: "FeatureCollection",
            features: [],
        };

        for (const route of routes) {
            const filteredTrips = trips.filter(
                (trip: Trip) => trip.route_id === route.route_id
            );
            const shapeIds = filteredTrips.map((trip: Trip) => trip.shape_id);
            const routeFeatures = tripFeatureCollection.features
                .filter((feature) => shapeIds.includes(feature.id as string))
                .map((feature) => feature.geometry.coordinates);
            routeFeaturesCollection.features.push({
                type: "Feature",
                id: route.route_id,
                properties: {
                    ...route,
                },
                geometry: {
                    type: "MultiLineString",
                    coordinates: routeFeatures,
                },
            });
        }
        return routeFeaturesCollection;
    }

    public async stopsToGeojson(): Promise<
        FeatureCollection<Point, GeoJsonProperties>
        > {
        const stops: Stop[] = await this.fileParser("stops.txt");
        return {
            type: "FeatureCollection",
            features: stops.map((stop) => {
                return {
                    type: "Feature",
                    id: stop.stop_id,
                    properties: {
                        stop_id: stop.stop_id,
                        stop_name: stop.stop_name,
                        stop_lon: stop.stop_lon,
                        stop_lat: stop.stop_lat,
                    },
                    geometry: {
                        type: "Point",
                        coordinates: [
                            stop.stop_lon as number,
                            stop.stop_lat as number,
                        ],
                    },
                };
            }),
        };
    }
}
