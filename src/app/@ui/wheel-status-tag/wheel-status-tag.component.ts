import { Component, Input, OnInit } from "@angular/core";

@Component({
    selector: "wheel-status-tag",
    templateUrl: "./wheel-status-tag.component.html",
    styleUrls: ["./wheel-status-tag.component.scss"],
})
export class WheelStatusTagComponent implements OnInit {
    @Input() wheelStatus!: string;

    constructor() {
        return;
    }

    ngOnInit(): void {
        return;
    }
}
