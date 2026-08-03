import { CommonModule } from "@angular/common";
import { Component, Input, OnInit } from "@angular/core";
import { NzTagModule } from "ng-zorro-antd/tag";

@Component({
    selector: "wheel-status-tag",
    templateUrl: "./wheel-status-tag.component.html",
    styleUrls: ["./wheel-status-tag.component.scss"],
    standalone: true,
    imports: [CommonModule, NzTagModule],
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
