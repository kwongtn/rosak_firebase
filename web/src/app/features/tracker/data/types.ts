import { transit_realtime } from "gtfs-realtime-bindings";

export interface IFeedEntity {
    [vehicleId: string]: transit_realtime.IVehiclePosition | null | undefined;
}
