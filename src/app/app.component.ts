import { filter } from "rxjs";
// import { DevConfigService } from "ng-devui/utils";
import { environment } from "src/environments/environment";

import {
    Component,
    ElementRef,
    HostListener,
    OnDestroy,
    OnInit,
} from "@angular/core";
import { Analytics } from "@angular/fire/analytics";
import { NavigationEnd, Router } from "@angular/router";

import { AuthService } from "./services/auth/auth.service";

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
        // tag: "Beta",
        // style: "waiting",
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

const noApplyPaddingRoutes: string[] = ["situasi"];

@Component({
    selector: "app-root",
    templateUrl: "./app.component.html",
    styleUrls: ["./app.component.scss"],
})
export class AppComponent implements OnInit, OnDestroy {
    innerMenuList = initialMenuList;

    header: string = "...";
    userAvatar: string = "";
    routeKey = "";
    applyPadding = true;

    constructor(
        public authService: AuthService,
        private elem: ElementRef,
        public router: Router,
        public analytics: Analytics
    ) {
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

    getRouteKey(): string {
        return this.router.url.split("/")[1];
    }

    getHeader(): string {
        if (window.innerWidth < 1024) {
            const headerTitle = this.innerMenuList.filter((value) => {
                return value["href"].split("/")[1] === this.getRouteKey();
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
                this.userAvatar = user.photoURL ?? "";

                this.addToMenu({
                    name: "@Me",
                    href: "/profile",
                    target: "_self",
                    headerTitle: " - About User ",
                });
            } else {
                this.removeFromMenu("/profile", "/console", "/jejak");
                this.userAvatar = "";
            }
        });

        this.authService.customClaims.subscribe((claim) => {
            console.log("Custom claims : ", claim);

            if (claim?.["admin"]) {
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

            if (claim?.["jejak"]) {
                this.addToMenu({
                    name: "Jejak",
                    href: "/jejak",
                    target: "_self",
                    tag: "Alpha",
                    style: "danger",
                    headerTitle: " - Jejak ",
                });
            } else {
                this.removeFromMenu("/jejak");
            }

            if (claim?.["betaTester"]) {
                this.addToMenu({
                    name: "Situasi",
                    href: "/situasi",
                    target: "_self",
                    tag: "Alpha",
                    style: "danger",
                    headerTitle: " - Situasi ",
                });
            } else {
                this.removeFromMenu("/situasi");
            }
        });

        this.router.events
            .pipe(
                filter((event) => {
                    return event instanceof NavigationEnd;
                })
            )
            .subscribe((event) => {
                this.header = this.getHeader();
                this.routeKey = this.getRouteKey();

                this.applyPadding = !noApplyPaddingRoutes.includes(
                    this.routeKey
                );
            });
    }

    ngOnDestroy(): void {
        this.authService.userData.unsubscribe();
    }
}
