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

const initialMenuList: { [key: string]: string }[] = [
    {
        name: "TranSPOT",
        href: "/spotting",
        target: "_self",
        tag: "Beta",
        style: "waiting",
    },
    {
        name: "About",
        href: "/about",
        // tag: "Prelim",
        // style: "default",
    },
];

@Component({
    selector: "app-root",
    templateUrl: "./app.component.html",
    styleUrls: ["./app.component.scss"],
})
export class AppComponent implements OnInit, OnDestroy {
    title = "public";
    innerMenuList = initialMenuList;

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
    }

    menuContainsHref(href: string) {
        return this.innerMenuList.some((item) => {
            return item["href"] === href;
        });
    }

    removeFromMenu(...hrefs: string[]) {
        this.innerMenuList = this.innerMenuList.filter((item) => {
            return !hrefs.includes(item["href"]);
        });
    }

    addToMenu(menuObj: any) {
        if (!this.menuContainsHref(menuObj["href"])) {
            this.innerMenuList.unshift(menuObj);
        }
    }

    ngOnInit() {
        this.authService.userData.subscribe((user) => {
            console.log(user);

            if (user) {
                this.userAvatar = (user.multiFactor as any).user.photoURL;

                this.addToMenu({
                    name: "@Me",
                    href: "/profile",
                    target: "_self",
                });
            } else {
                this.removeFromMenu("/profile", "/console");
                this.userAvatar = "";
            }
        });

        this.authService.customClaims.subscribe((claim) => {
            console.log("Custom claims : ", claim);

            if (claim?.admin) {
                this.addToMenu({
                    name: "Console",
                    href: "/console",
                    target: "_self",
                    tag: "Admin",
                    style: "danger",
                });
            } else {
                this.removeFromMenu("/console");
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
