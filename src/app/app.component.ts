// import { DevConfigService } from "ng-devui/utils";
import { environment } from "src/environments/environment";

import { HttpClient } from "@angular/common/http";
import { Component, OnDestroy, OnInit } from "@angular/core";

import build from "../build";
import { AuthService } from "./services/auth/auth.service";

interface BackendBuildInfo {
    hash: string;
    datetime: string;
}

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
            style: "danger",
        },
        {
            name: "About",
            href: "/about",
            tag: "Prelim",
            style: "default",
        },
    ];

    userAvatar: string = "";
    buildInfo = build;
    backendBuildInfo: BackendBuildInfo = {
        hash: "...",
        datetime: "...",
    };

    constructor(
        public authService: AuthService,
        private httpClient: HttpClient // private devConfigService: DevConfigService,
    ) {
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

        this.httpClient
            .get<BackendBuildInfo>(environment.backendUrl + "version/")
            .subscribe((data) => {
                this.backendBuildInfo = data;
                console.log(this.backendBuildInfo);
            });
    }

    ngOnDestroy(): void {
        this.authService.userData.unsubscribe();
    }
}
