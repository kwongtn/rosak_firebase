import { NzButtonModule } from "ng-zorro-antd/button";
import { NzCardModule } from "ng-zorro-antd/card";
import { NzCheckboxModule } from "ng-zorro-antd/checkbox";
import { NzCollapseModule } from "ng-zorro-antd/collapse";
import { NzFlexModule } from "ng-zorro-antd/flex";
import { NzGridModule } from "ng-zorro-antd/grid";
import { NzIconModule } from "ng-zorro-antd/icon";
import { NzListModule } from "ng-zorro-antd/list";
import { NzProgressModule } from "ng-zorro-antd/progress";
import { NzSpaceModule } from "ng-zorro-antd/space";
import { NzSpinModule } from "ng-zorro-antd/spin";
import { NzToolTipModule } from "ng-zorro-antd/tooltip";
import { environment } from "src/environments/environment";

import { CommonModule } from "@angular/common";
import { Component, OnInit } from "@angular/core";
import { FormsModule } from "@angular/forms";

import { GtfsStateService } from "../services/gtfs-state.service";
import {
    ICheckboxItem,
    PanelSelectionService,
    PanelType,
} from "../services/panel-selection.service";
import { PanelComponent } from "./panel/panel.component";

@Component({
    selector: "tracker-status-card",
    standalone: true,
    imports: [
        CommonModule,
        NzButtonModule,
        NzCardModule,
        NzCheckboxModule,
        NzCollapseModule,
        NzFlexModule,
        NzGridModule,
        NzIconModule,
        NzListModule,
        NzProgressModule,
        NzSpaceModule,
        NzSpinModule,
        NzToolTipModule,
        FormsModule,
        PanelComponent,
    ],
    templateUrl: "./status-card.component.html",
    styleUrl: "./status-card.component.scss",
})
export class StatusCardComponent implements OnInit {
    env = environment;
    applyLoading = false;
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

    constructor(
        public panelSelectionService: PanelSelectionService,
        public gtfsStateService: GtfsStateService
    ) {}

    ngOnInit() {
        this.onApply();
    }

    onRtChange(options: ICheckboxItem[]) {
        console.log(options);
    }

    updateChecked({ id, index }: { id: string; index: number }) {
        console.log(id, index);
        this.panelSelectionService.toggleChecked(id as PanelType, index);
        this.hasUnsavedChanges = true;
    }

    onApply(event?: Event) {
        console.log(this.panelSelectionService.panels);

        // Update realtime layer source
        this.gtfsStateService.upsertSourceUrls(
            this.panelSelectionService.getCurrentSelected("rtLayer")
        );
        this.panelSelectionService.onApply();
    }
}
