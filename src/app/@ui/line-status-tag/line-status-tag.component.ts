import { LineStatus } from "src/app/models/query/get-vehicles";

import { CommonModule } from "@angular/common";
import { Component, Input } from "@angular/core";
import { NzTagModule } from "ng-zorro-antd/tag";

@Component({
    standalone: true,
    selector: "line-status-tag",
    templateUrl: "./line-status-tag.component.html",
    styleUrls: ["./line-status-tag.component.scss"],
    imports: [CommonModule, NzTagModule]
})
export class LineStatusTagComponent {
  @Input() lineStatus!: LineStatus;
}
