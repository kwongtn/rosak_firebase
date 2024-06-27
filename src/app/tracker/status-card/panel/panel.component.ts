import { NzCheckboxModule } from "ng-zorro-antd/checkbox";
import { NzIconModule } from "ng-zorro-antd/icon";
import { NzListModule } from "ng-zorro-antd/list";
import { NzSpinModule } from "ng-zorro-antd/spin";

import { Component, Input } from "@angular/core";

import {
    GtfsStaticStateService,
} from "../../services/gtfs-static-state.service";
import {
    ICollapseItem,
    PanelSelectionService,
    PanelType,
} from "../../services/panel-selection.service";
import {
    PanelRtLayerComponent,
} from "../panel-rt-layer/panel-rt-layer.component";

@Component({
    selector: "tracker-status-card-panel",
    standalone: true,
    imports: [
        NzCheckboxModule,
        NzIconModule,
        NzListModule,
        NzSpinModule,
        PanelRtLayerComponent,
    ],
    templateUrl: "./panel.component.html",
    styleUrl: "./panel.component.scss",
})
export class PanelComponent {
    @Input() panelKey!: string;
    @Input() panelData!: ICollapseItem;

    constructor(
        public panelSelectionService: PanelSelectionService,
        public gtfsStaticStateService: GtfsStaticStateService
    ) {}

    updateChecked(panelKey: string, i: number) {
        this.panelSelectionService.toggleChecked(panelKey as PanelType, i);
    }
}
