import { LineStatus } from "src/app/models/query/get-vehicles";

import { Component, Input } from "@angular/core";

@Component({
    selector: "line-status-tag",
    templateUrl: "./line-status-tag.component.html",
    styleUrls: ["./line-status-tag.component.scss"],
})
export class LineStatusTagComponent {
  @Input() lineStatus!: LineStatus;
}
