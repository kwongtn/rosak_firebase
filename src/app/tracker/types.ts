import { transit_realtime } from "gtfs-realtime-bindings";

import { IPopup } from "@antv/l7";

export interface IFeedEntity {
    [key: string]: transit_realtime.IVehiclePosition | null | undefined;
}

export interface IPopupWithProps {
    instance: IPopup;
    isClosed: boolean;
}
