import { Component, Input } from "@angular/core";

@Component({
    selector: "situasi-content",
    templateUrl: "./content.component.html",
    styleUrls: ["./content.component.scss"],
})
export class ContentComponent {
    @Input() title: string = "Title";
    @Input() subtitle: string = "subtitle";
}
