import { Component, Input, OnInit, TemplateRef } from "@angular/core";

@Component({
    selector: "app-theme-switch",
    templateUrl: "./theme-switch.component.html",
    styleUrls: ["./theme-switch.component.scss"],
})
export class ThemeSwitchComponent implements OnInit {
    @Input() contentTemplate!: TemplateRef<any>;

    constructor() {
        return;
    }

    ngOnInit(): void {
        return;
    }
}
