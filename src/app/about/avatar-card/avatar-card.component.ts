import { Component, Input, OnInit } from "@angular/core";

import { Personnel } from "../models/firestore";

@Component({
    selector: "app-avatar-card",
    templateUrl: "./avatar-card.component.html",
    styleUrls: ["./avatar-card.component.scss"],
})
export class AvatarCardComponent implements OnInit {
    @Input() data!: Personnel;

    constructor() {
        return;
    }

    ngOnInit(): void {
        return;
    }
}
