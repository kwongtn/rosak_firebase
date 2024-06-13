import { NzAvatarModule } from "ng-zorro-antd/avatar";
import { NzCardModule } from "ng-zorro-antd/card";
import { NzIconModule } from "ng-zorro-antd/icon";
import { NzToolTipModule } from "ng-zorro-antd/tooltip";

import { Component, Input, OnInit } from "@angular/core";

import { Personnel } from "../models/firestore";
import { Icon } from "./avatar-card.icons";

@Component({
    selector: "about-avatar",
    templateUrl: "./avatar-card.component.html",
    styleUrls: ["./avatar-card.component.scss"],
    standalone: true,
    imports: [NzCardModule, NzToolTipModule, NzIconModule, NzAvatarModule],
})
export class AvatarCardComponent implements OnInit {
    @Input() data!: Personnel;
    icon = Icon;

    constructor() {
        return;
    }

    ngOnInit(): void {
        return;
    }
}
