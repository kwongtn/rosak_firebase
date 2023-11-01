import { Component } from "@angular/core";

export interface BreadcrumbsData {
    displayText: string;
    href: string[];
}

@Component({
    selector: "situasi-content",
    templateUrl: "./content.component.html",
    styleUrls: ["./content.component.scss"],
})
export class ContentComponent {}
