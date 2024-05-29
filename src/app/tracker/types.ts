import { transit_realtime } from "gtfs-realtime-bindings";

export interface IFeedEntity {
    [key: string]: transit_realtime.IVehiclePosition | null | undefined;
}
