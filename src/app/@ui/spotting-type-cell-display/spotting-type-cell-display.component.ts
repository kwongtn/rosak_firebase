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

    constructor() {
        return;
    }

    ngOnInit(): void {
        return;
    }
}
