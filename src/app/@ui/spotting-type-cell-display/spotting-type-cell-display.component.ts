import { NzIconModule } from "ng-zorro-antd/icon";
import { NzToolTipModule } from "ng-zorro-antd/tooltip";
import {
    ConsoleEventsGqlResponseTableDataElement,
} from "src/app/console/services/events-gql.service";
import {
    BeautifulDecimalPipe,
} from "src/app/pipes/beautiful-decimal/beautiful-decimal.pipe";
import {
    CoordinatesHumanizerPipe,
} from "src/app/pipes/coordinates-humanizer/coordinates-humanizer.pipe";
import { SpottingType } from "src/app/pipes/spotting-type/spotting-type.pipe";

import { Component, Input, OnInit } from "@angular/core";

import {
    SpottingTypeTagModule,
} from "../spotting-type-tag/spotting-type-tag.module";

@Component({
    selector: "spotting-type-cell-display",
    templateUrl: "./spotting-type-cell-display.component.html",
    styleUrls: ["./spotting-type-cell-display.component.scss"],
    standalone: true,
    imports: [
        // CommonModule,
        NzIconModule,
        NzToolTipModule,
        BeautifulDecimalPipe,
        CoordinatesHumanizerPipe,
        SpottingTypeTagModule,
    ],
})
export class SpottingTypeCellDisplayComponent implements OnInit {
    @Input() rowItem!: ConsoleEventsGqlResponseTableDataElement;
    @Input() spottingType!: SpottingType;

    showLocationPopover: boolean = false;

    constructor() {
        return;
    }

    ngOnInit(): void {
        if (
            this.rowItem.location?.altitude ||
            this.rowItem.location?.heading ||
            this.rowItem.location?.speed
        ) {
            this.showLocationPopover = true;
        }
        return;
    }
}
