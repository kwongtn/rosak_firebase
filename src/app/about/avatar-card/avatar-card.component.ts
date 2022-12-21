import { Component, Input, OnInit } from "@angular/core";

import { Personnel } from "../models/firestore";
import { Icon } from "./avatar-card.icons";

@Component({
    selector: "about-avatar",
    templateUrl: "./avatar-card.component.html",
    styleUrls: ["./avatar-card.component.scss"],
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
