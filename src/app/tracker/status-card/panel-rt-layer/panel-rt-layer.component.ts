import { NzCheckboxModule } from "ng-zorro-antd/checkbox";
import { NzCollapsePanelComponent } from "ng-zorro-antd/collapse";
import { NzIconModule } from "ng-zorro-antd/icon";
import { NzListModule } from "ng-zorro-antd/list";
import { NzProgressModule } from "ng-zorro-antd/progress";
import { NzSpinModule } from "ng-zorro-antd/spin";
import { NzToolTipModule } from "ng-zorro-antd/tooltip";

import { CommonModule } from "@angular/common";
import { Component, Input } from "@angular/core";

import { GtfsRtStateService } from "../../services/gtfs-rt-state.service";
import {
    ICollapseItem,
    PanelSelectionService,
    PanelType,
} from "../../services/panel-selection.service";

@Component({
    selector: "tracker-panel-rt-layer",
    standalone: true,
    imports: [
        CommonModule,
        NzCheckboxModule,
        NzCollapsePanelComponent,
        NzIconModule,
        NzListModule,
        NzProgressModule,
        NzSpinModule,
        NzToolTipModule,
    ],
    templateUrl: "./panel-rt-layer.component.html",
    styleUrl: "./panel-rt-layer.component.scss",
})
export class PanelRtLayerComponent {
    @Input() panelKey!: string;
    @Input() panelData!: ICollapseItem;

    constructor(
        public panelSelectionService: PanelSelectionService,
        public gtfsRtStateService: GtfsRtStateService
    ) {}

    updateChecked(id: string, index: number) {
        console.log(id, index);
        this.panelSelectionService.toggleChecked(id as PanelType, index);
    }
}
