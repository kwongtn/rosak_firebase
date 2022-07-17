import { Component } from "@angular/core";

@Component({
    selector: "app-root",
    templateUrl: "./app.component.html",
    styleUrls: ["./app.component.scss"],
})
export class AppComponent {
    title = "public";
    innerMenuList = [
        {
            name: "Spotting",
            href: "/spotting",
            target: "_self",
        },
        {
            name: "About",
            href: "/about",
        },
        {
            name: "GitHub",
            href: "https://github.com/kwongtn/rosak_firebase",
        },
    ];

    constructor() {
        return;
    }
}
