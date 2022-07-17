import { Component, OnInit } from "@angular/core";

import { AuthService } from "./services/auth/auth.service";

@Component({
    selector: "app-root",
    templateUrl: "./app.component.html",
    styleUrls: ["./app.component.scss"],
})
export class AppComponent implements OnInit {
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

    userAvatar: string = "";

    constructor(public authService: AuthService) {
        return;
    }

    ngOnInit() {
        this.authService.userData.subscribe((userCredential) => {
            if (userCredential) {
                this.userAvatar = (
                    userCredential.additionalUserInfo?.profile as any
                ).picture;
            } else {
                this.userAvatar = "";
            }
        });
    }
}
