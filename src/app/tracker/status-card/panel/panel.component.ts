
import { Component, Input } from "@angular/core";

import { ICollapseItem } from "../../services/panel-selection.service";
import {
    PanelRtLayerComponent,
} from "../panel-rt-layer/panel-rt-layer.component";

@Component({
    selector: "tracker-status-card-panel",
    standalone: true,
    imports: [PanelRtLayerComponent],
    templateUrl: "./panel.component.html",
    styleUrl: "./panel.component.scss",
})
export class PanelComponent {
    @Input() panelKey!: string;
    @Input() panelData!: ICollapseItem;

    constructor() {}
}
