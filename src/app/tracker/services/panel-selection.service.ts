import { BehaviorSubject } from "rxjs";

import { Injectable } from "@angular/core";

import { RtGtfsConfig } from "./gtfs-rt-state.service";

export interface ICheckboxItem {
    label: string;
    value: string;
    checked: boolean;
    endpoint: string;
    source?: string;
}

export interface ICollapseItem {
    active: boolean;
    disabled: boolean;
    name: string;
    checkBoxes: ICheckboxItem[];
}

export type PanelType = "rtLayer" | "pathLayer" | "stopsLayer";

export type IPanels = {
    [key in PanelType]: ICollapseItem;
};

@Injectable({
    providedIn: "root",
})
export class PanelSelectionService {
    panels: IPanels = {
        // Do checkboxes to select items
        rtLayer: {
            active: false,
            disabled: false,
            name: "Realtime layer",
            checkBoxes: [
                {
                    label: "myBAS Johor Bahru",
                    value: "mybas-johor",
                    endpoint:
                        "https://api.data.gov.my/gtfs-realtime/vehicle-position/mybas-johor",
                    checked: false,
                    source: "https://developer.data.gov.my/realtime-api/gtfs-realtime#mybas-johor-bahru",
                },
                {
                    label: "KTMB",
                    value: "ktmb",
                    endpoint:
                        "https://api.data.gov.my/gtfs-realtime/vehicle-position/ktmb",
                    checked: false,
                    source: "https://developer.data.gov.my/realtime-api/gtfs-realtime#ktmb",
                },
                {
                    label: "RapidBus KL",
                    value: "prasarana-rapid-bus-kl",
                    endpoint:
                        "https://api.data.gov.my/gtfs-realtime/vehicle-position/prasarana?category=rapid-bus-kl",
                    checked: false,
                    source: "https://developer.data.gov.my/realtime-api/gtfs-realtime#prasarana",
                },
                {
                    label: "RapidBus MRT Feeder",
                    value: "prasarana-rapid-bus-mrtfeeder",
                    endpoint:
                        "https://api.data.gov.my/gtfs-realtime/vehicle-position/prasarana?category=rapid-bus-mrtfeeder",
                    checked: false,
                    source: "https://developer.data.gov.my/realtime-api/gtfs-realtime#prasarana",
                },
                {
                    label: "RapidBus Kuantan",
                    value: "prasarana-rapid-bus-kuantan",
                    endpoint:
                        "https://api.data.gov.my/gtfs-realtime/vehicle-position/prasarana?category=rapid-bus-kuantan",
                    checked: false,
                    source: "https://developer.data.gov.my/realtime-api/gtfs-realtime#prasarana",
                },
                {
                    label: "RapidBus Penang",
                    value: "prasarana-rapid-bus-penang",
                    endpoint:
                        "https://api.data.gov.my/gtfs-realtime/vehicle-position/prasarana?category=rapid-bus-penang",
                    checked: false,
                    source: "https://developer.data.gov.my/realtime-api/gtfs-realtime#prasarana",
                },
                // {
                //     label: "RapidRail KL",
                //     value: "prasarana-rapid-rail-kl",
                //     endpoint:
                //         "https://api.data.gov.my/gtfs-realtime/vehicle-position/prasarana?category=rapid-rail-kl",
                //     checked: false,
                //     source: "https://developer.data.gov.my/realtime-api/gtfs-realtime#prasarana",
                // },
            ],
        },
        pathLayer: {
            active: false,
            disabled: false,
            name: "Route layer",
            checkBoxes: [
                {
                    label: "Malaysia Railway",
                    value: "malaysia-railway",
                    endpoint:
                        "gs://rosak-7223b.appspot.com/public/malaysia_railway.geo.zip",
                    checked: true,
                    source: "https://www.openstreetmap.org/",
                },
            ],
        },
        stopsLayer: {
            active: false,
            disabled: false,
            name: "Stops layer",
            checkBoxes: [
                {
                    label: "myBAS Johor Bahru",
                    value: "mybas-johor",
                    endpoint: "https://api.data.gov.my/gtfs-static/mybas-johor",
                    checked: false,
                    source: "https://developer.data.gov.my/realtime-api/gtfs-static#mybas-johor-bahru",
                },
                {
                    label: "KTMB",
                    value: "ktmb",
                    endpoint: "https://api.data.gov.my/gtfs-static/ktmb",
                    checked: false,
                    source: "https://developer.data.gov.my/realtime-api/gtfs-realtime#ktmb",
                },
                {
                    label: "RapidBus KL",
                    value: "prasarana-rapid-bus-kl",
                    endpoint:
                        "https://api.data.gov.my/gtfs-static/prasarana?category=rapid-bus-kl",
                    checked: false,
                    source: "https://developer.data.gov.my/realtime-api/gtfs-realtime#prasarana",
                },
                {
                    label: "RapidBus MRT Feeder",
                    value: "prasarana-rapid-bus-mrtfeeder",
                    endpoint:
                        "https://api.data.gov.my/gtfs-static/prasarana?category=rapid-bus-mrtfeeder",
                    checked: false,
                    source: "https://developer.data.gov.my/realtime-api/gtfs-realtime#prasarana",
                },
                {
                    label: "RapidRail KL",
                    value: "prasarana-rapid-rail-kl",
                    endpoint:
                        "https://api.data.gov.my/gtfs-static/prasarana?category=rapid-rail-kl",
                    checked: false,
                    source: "https://developer.data.gov.my/realtime-api/gtfs-realtime#prasarana",
                },
                {
                    label: "RapidBus Kuantan",
                    value: "prasarana-rapid-bus-kuantan",
                    endpoint:
                        "https://api.data.gov.my/gtfs-static/prasarana?category=rapid-bus-kuantan",
                    checked: false,
                    source: "https://developer.data.gov.my/realtime-api/gtfs-realtime#prasarana",
                },
                {
                    label: "RapidBus Penang",
                    value: "prasarana-rapid-bus-penang",
                    endpoint:
                        "https://api.data.gov.my/gtfs-static/prasarana?category=rapid-bus-penang",
                    checked: false,
                    source: "https://developer.data.gov.my/realtime-api/gtfs-realtime#prasarana",
                },
            ],
        },
    };
    hasUnsavedChanges: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(
        false
    );

    constructor() {}

    toggleChecked(id: PanelType, index: number) {
        this.panels[id].checkBoxes[index].checked =
            !this.panels[id].checkBoxes[index].checked;
        this.hasUnsavedChanges.next(true);
    }

    getCurrentSelected(panelType: PanelType): {
        [key: string]: RtGtfsConfig;
    } {
        const returnObj: {
            [key: string]: RtGtfsConfig;
        } = {};
        this.panels[panelType].checkBoxes
            .filter((item) => item.checked)
            .forEach((elem) => {
                returnObj[elem.value as PanelType] = {
                    sourceUrl: elem.endpoint,
                };
            });

        return returnObj;
    }

    onApply() {
        this.hasUnsavedChanges.next(false);
    }
}
