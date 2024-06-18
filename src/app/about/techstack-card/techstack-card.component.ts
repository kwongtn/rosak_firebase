import { NzCardModule } from "ng-zorro-antd/card";

import { Component, Input, OnInit } from "@angular/core";

import { TechStack } from "../models/firestore";

@Component({
    selector: "about-techstack",
    templateUrl: "./techstack-card.component.html",
    styleUrls: ["./techstack-card.component.scss"],
    standalone: true,
    imports: [NzCardModule],
})
export class TechstackCardComponent implements OnInit {
    @Input() data!: TechStack;

    constructor() {
        return;
    }

    ngOnInit(): void {
        return;
    }
}
