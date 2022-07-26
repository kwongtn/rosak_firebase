import { environment } from "src/environments/environment";

import { Component, OnDestroy, OnInit } from "@angular/core";

import build from "../build";
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
    buildInfo = build;

    constructor(public authService: AuthService) {
        console.log(
            "\n%cBuild Info:\n\n" +
                `%c > Environment: %c${
                    environment.production ? "production 🏭" : "development 🚧"
                }\n` +
                `%c > Build Version: ${build.version}\n` +
                ` > Build Timestamp: ${build.timestamp}\n` +
                ` > Built by: ${build.git.user}\n` +
                ` > Commit: ${build.git.hash} @ ${build.git.branch}\n` +
                ` > Build Message: %c${build.message || "<no message>"}\n`,
            "font-size: 14px; color: #7c7c7b;",
            "font-size: 12px; color: #7c7c7b",
            environment.production
                ? "font-size: 12px; color: #95c230;"
                : "font-size: 12px; color: #e26565;",
            "font-size: 12px; color: #7c7c7b",
            "font-size: 12px; color: #bdc6cf"
        );
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
