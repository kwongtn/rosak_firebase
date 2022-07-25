import { Component, OnDestroy, OnInit } from "@angular/core";

import { AuthService } from "./services/auth/auth.service";

@Component({
    selector: "app-root",
    templateUrl: "./app.component.html",
    styleUrls: ["./app.component.scss"],
})
export class AppComponent implements OnInit, OnDestroy {
    title = "public";
    innerMenuList = [
        {
            name: "Spotting",
            href: "/spotting",
            target: "_self",
            tag: "Alpha",
        },
        {
            name: "About",
            href: "/about",
            tag: "",
        },
    ];

    userAvatar: string = "";

    constructor(public authService: AuthService) {
        return;
    }

    ngOnInit() {
        this.authService.userData.subscribe((user) => {
            if (user) {
                this.userAvatar = (user.multiFactor as any).user.photoURL;
            } else {
                this.userAvatar = "";
            }
        });
    }

    ngOnDestroy(): void {
        this.authService.userData.unsubscribe();
    }
}
