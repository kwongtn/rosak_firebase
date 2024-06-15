import { NzCheckboxModule } from "ng-zorro-antd/checkbox";
import { NzCollapsePanelComponent } from "ng-zorro-antd/collapse";
import { NzIconModule } from "ng-zorro-antd/icon";
import { NzListModule } from "ng-zorro-antd/list";
import { NzProgressModule } from "ng-zorro-antd/progress";
import { NzSpinModule } from "ng-zorro-antd/spin";
import { NzToolTipModule } from "ng-zorro-antd/tooltip";

import { CommonModule } from "@angular/common";
import { Component, Input, output } from "@angular/core";

import { GtfsStateService } from "../../services/gtfs-state.service";
import {
    ICollapseItem,
    PanelSelectionService,
    PanelType,
} from "../../services/panel-selection.service";

@Component({
    selector: "tracker-status-card-panel",
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
    templateUrl: "./panel.component.html",
    styleUrl: "./panel.component.scss",
})
export class PanelComponent {
    @Input() panelKey!: string;
    @Input() panelData!: ICollapseItem;

    onSelectionChange = output<{
        id: string;
        index: number;
    }>();

    constructor(
        public panelSelectionService: PanelSelectionService,
        public gtfsStateService: GtfsStateService
    ) {}

    updateChecked(id: string, index: number) {
        console.log(id, index);
        this.panelSelectionService.toggleChecked(id as PanelType, index);

        // this.onSelectionChange.emit({ id, index });
    }
}
