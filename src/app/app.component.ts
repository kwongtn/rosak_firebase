import { filter } from "rxjs";
// import { DevConfigService } from "ng-devui/utils";
import { environment } from "src/environments/environment";

import { HttpClient } from "@angular/common/http";
import {
    Component,
    ElementRef,
    HostListener,
    OnDestroy,
    OnInit,
} from "@angular/core";
import { NavigationEnd, Router } from "@angular/router";

import build from "../build";
import { AuthService } from "./services/auth/auth.service";

interface BackendBuildInfo {
    hash: string;
    datetime: string;
}

const genericTitle = " Malaysia Land Public Transport Fans ";

const initialMenuList: { [key: string]: string }[] = [
    {
        name: "Gallery",
        href: "/gallery",
        target: "_self",
        tag: "Alpha",
        style: "danger",
        headerTitle: " - Gallery ",
    },
    {
        name: "Situasi",
        href: "/situasi",
        target: "_self",
        tag: "Alpha",
        style: "danger",
        headerTitle: " - Situasi ",
    },
    {
        name: "Insiden",
        href: "/insiden",
        target: "_self",
        tag: "Beta",
        style: "waiting",
        headerTitle: " - Insiden ",
    },
    {
        name: "TranSPOT",
        href: "/spotting",
        target: "_self",
        tag: "Beta",
        style: "waiting",
        headerTitle: " - TranSPOT ",
    },
    {
        name: "About",
        href: "/about",
        headerTitle: " - About the Project ",
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
    innerMenuList = initialMenuList;

    header: string = "...";
    userAvatar: string = "";
    buildInfo = build;
    backendBuildInfo: BackendBuildInfo = {
        hash: "...",
        datetime: "...",
    };

    constructor(
        public authService: AuthService,
        private httpClient: HttpClient,
        private elem: ElementRef,
        public router: Router
    ) {
        console.log(
            [
                "\n%cBuild Info:\n",
                `%c > Environment: %c${
                    environment.production
                        ? "production 🏭"
                        : environment.sentry.environment === "staging"
                            ? "staging 🚈"
                            : "development 🚧"
                }`,
                `%c > Build Version: ${build.version}`,
                ` > Build Timestamp: ${build.timestamp}`,
                ` > Built by: ${build.git.user}`,
                ` > Commit: ${build.git.hash} @ ${build.git.branch}`,
                ` > Build Message: %c${build.message || "<no message>"}`,
            ].join("\n"),
            "font-size: 14px; color: #7c7c7b;",
            "font-size: 12px; color: #7c7c7b",
            environment.production
                ? "font-size: 12px; color: #95c230;"
                : "font-size: 12px; color: #e26565;",
            "font-size: 12px; color: #7c7c7b",
            "font-size: 12px; color: #bdc6cf"
        );

        if (environment.sentry.environment === "staging") {
            this.elem.nativeElement.style.setProperty("--padding-top", "100px");
        } else {
            this.elem.nativeElement.style.setProperty("--padding-top", "70px");
        }
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

    @HostListener("window:resize")
    resize(): void {
        this.header = this.getHeader();
    }

    getHeader(): string {
        if (window.innerWidth < 1024) {
            const headerTitle = this.innerMenuList.filter((value) => {
                return (
                    value["href"].split("/")[1] ===
                    this.router.url.split("/")[1]
                );
            })[0];

            if (headerTitle) {
                return headerTitle["headerTitle"];
            }
        }
        return genericTitle;
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
                    headerTitle: " - About User ",
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
                    headerTitle: " - Spotting Console ",
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

        this.router.events
            .pipe(
                filter((event) => {
                    return event instanceof NavigationEnd;
                })
            )
            .subscribe((event) => {
                this.header = this.getHeader();
            });
    }

    ngOnDestroy(): void {
        this.authService.userData.unsubscribe();
    }
}
