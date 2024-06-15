import { Component, OnInit } from "@angular/core";

import { GdprComponent } from "./gdpr/gdpr.component";

@Component({
    selector: "app-compliance",
    templateUrl: "./compliance.component.html",
    styleUrls: ["./compliance.component.scss"],
    standalone: true,
    imports: [GdprComponent],
})
export class ComplianceComponent implements OnInit {
    constructor() {
        return;
    }

    ngOnInit(): void {
        return;
    }
}
