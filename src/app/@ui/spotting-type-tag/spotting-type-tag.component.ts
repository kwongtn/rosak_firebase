import { Component, Input, OnInit } from "@angular/core";

type SpottingType = "DEPOT" | "LOCATION" | "BETWEEN_STATIONS" | "JUST_SPOTTING";

@Component({
    selector: "spotting-type-tag",
    templateUrl: "./spotting-type-tag.component.html",
    styleUrls: ["./spotting-type-tag.component.scss"],
})
export class SpottingTypeTagComponent implements OnInit {
    @Input() spottingType!: SpottingType;

    constructor() {
        return;
    }

    ngOnInit(): void {
        return;
    }
}
