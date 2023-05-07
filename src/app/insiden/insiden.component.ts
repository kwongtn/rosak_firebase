import { Component } from "@angular/core";

@Component({
    selector: "app-insiden-main",
    templateUrl: "./insiden.component.html",
    styleUrls: ["./insiden.component.scss"],
})
export class InsidenMainComponent {
    selectedDate: Date = new Date(
        new Date().getTime() - new Date().getTimezoneOffset() * 60 * 1000
    );
    
}
