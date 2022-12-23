import {
    ConsoleEventsGqlResponseTableDataElement,
} from "src/app/console/services/events-gql/events-gql.service";
import { SpottingType } from "src/app/models/spotting-table/source-type";

import { Component, Input, OnInit } from "@angular/core";

@Component({
    selector: "spotting-type-cell-display",
    templateUrl: "./spotting-type-cell-display.component.html",
    styleUrls: ["./spotting-type-cell-display.component.scss"],
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
