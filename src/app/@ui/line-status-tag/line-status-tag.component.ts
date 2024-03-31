import { TagsModule } from "ng-devui/tags";
import { LineStatus } from "src/app/models/query/get-vehicles";

import { CommonModule } from "@angular/common";
import { Component, Input } from "@angular/core";

@Component({
    standalone: true,
    selector: "line-status-tag",
    templateUrl: "./line-status-tag.component.html",
    styleUrls: ["./line-status-tag.component.scss"],
    imports: [CommonModule, TagsModule]
})
export class LineStatusTagComponent {
  @Input() lineStatus!: LineStatus;
}
