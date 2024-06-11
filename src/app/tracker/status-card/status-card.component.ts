import { NzButtonModule } from "ng-zorro-antd/button";
import { NzCardModule } from "ng-zorro-antd/card";
import { NzCheckboxModule } from "ng-zorro-antd/checkbox";
import { NzCollapseModule } from "ng-zorro-antd/collapse";
import { NzFlexModule } from "ng-zorro-antd/flex";
import { NzGridModule } from "ng-zorro-antd/grid";

import { CommonModule } from "@angular/common";
import { Component } from "@angular/core";
import { FormsModule } from "@angular/forms";

interface ICheckboxItem {
    label: string;
    value: string;
    checked: boolean;
    source?: string;
    children?: ICheckboxItem[];
}

@Component({
    selector: "tracker-status-card",
    standalone: true,
    imports: [
        CommonModule,
        NzButtonModule,
        NzCardModule,
        NzCheckboxModule,
        NzFlexModule,
        NzGridModule,
        NzCollapseModule,
        FormsModule,
    ],
    templateUrl: "./status-card.component.html",
    styleUrl: "./status-card.component.scss",
})
export class StatusCardComponent {
    applyLoading = false;
    panels: { [key: string]: any } = {
        // Do checkboxes to select items
        rtLayer: {
            active: false,
            disabled: false,
            name: "Realtime layer",
            checkBoxes: [
                {
                    label: "myBAS Johor Bahru",
                    value: "mybas-johor",
                    checked: true,
                    source: "https://developer.data.gov.my/realtime-api/gtfs-realtime#mybas-johor-bahru",
                },
                {
                    label: "KTMB",
                    value: "ktmb",
                    checked: false,
                    source: "https://developer.data.gov.my/realtime-api/gtfs-realtime#ktmb",
                },
                {
                    label: "Prasarana",
                    value: "prasarana",
                    checked: false,
                    source: "https://developer.data.gov.my/realtime-api/gtfs-realtime#prasarana",
                    children: [
                        {
                            label: "RapidBus KL",
                            value: "rapid-bus-kl",
                            checked: false,
                        },
                        {
                            label: "RapidBus MRT Feeder",
                            value: "rapid-bus-mrtfeeder",
                            checked: false,
                        },
                        {
                            label: "RapidBus Kuantan",
                            value: "rapid-bus-kuantan",
                            checked: false,
                        },
                        {
                            label: "RapidBus Penang",
                            value: "rapid-bus-penang",
                            checked: false,
                        },
                        {
                            label: "RapidRail KL",
                            value: "rapid-rail-kl",
                            checked: false,
                        },
                    ],
                },
            ],
        },
        routeLayer: {
            active: false,
            disabled: true,
            name: "Route layer",
            checkBoxes: [],
        },
        stopsLayer: {
            active: false,
            disabled: false,
            name: "Stops layer",
            checkBoxes: [
                {
                    label: "myBAS Johor Bahru",
                    value: "mybas-johor",
                    checked: true,
                    source: "https://api.data.gov.my/gtfs-static/mybas-johor",
                },
                {
                    label: "KTMB",
                    value: "ktmb",
                    checked: false,
                    source: "https://api.data.gov.my/gtfs-static/ktmb",
                },
                {
                    label: "Prasarana",
                    value: "prasarana",
                    checked: false,
                    source: "https://developer.data.gov.my/realtime-api/gtfs-realtime#prasarana",
                    children: [
                        {
                            label: "RapidBus KL",
                            value: "rapid-bus-kl",
                            checked: false,
                        },
                        {
                            label: "RapidBus MRT Feeder",
                            value: "rapid-bus-mrtfeeder",
                            checked: false,
                        },
                        {
                            label: "RapidRail KL",
                            value: "rapid-rail-kl",
                            checked: false,
                        },
                        {
                            label: "RapidBus Kuantan",
                            value: "rapid-bus-kuantan",
                            checked: false,
                        },
                        {
                            label: "RapidBus Penang",
                            value: "rapid-bus-penang",
                            checked: false,
                        },
                    ],
                },
            ],
        },
    };

    hasUnsavedChanges = false;

    sources = [
        {
            name: "",
            url: "https://developer.data.gov.my/realtime-api/gtfs-realtime",
        },
        { name: "Open Street Maps (OSM)", url: "" },
        {
            name: "Open DOSM",
            url: "https://developer.data.gov.my/realtime-api/gtfs-static",
        },
    ];

    // On change of selection, display nz-card button area

    onRtChange(options: ICheckboxItem[]) {
        console.log(options);
    }

    updateChecked(id: string, index: number) {
        console.log(id, index);
        this.panels[id].checkBoxes[index].checked =
            !this.panels[id].checkBoxes[index].checked;
        this.hasUnsavedChanges = true;
    }

    onApply(event: Event) {
        console.log(this.panels);
        this.hasUnsavedChanges = false;
    }
}
