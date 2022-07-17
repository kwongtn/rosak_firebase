import {
    Component,
    ContentChildren,
    HostListener,
    Input,
    OnInit,
    QueryList,
} from "@angular/core";
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser";

import { LogoComponent } from "../logo/logo.component";

@Component({
    selector: "d-common-header",
    templateUrl: "./header.component.html",
    styleUrls: ["./header.component.scss"],
})
export class HeaderComponent implements OnInit {
    @Input() showShadow = false;
    @Input() isFixed = false;
    @Input() hasMaxWidth = true;
    @Input() showSlideButton = true;
    @Input() showSearch = false;
    @Input() showAvatar = false;
    @Input() repoName = "ng-devui";

    repoLink!: SafeResourceUrl;

    @ContentChildren(LogoComponent) subLogo: QueryList<LogoComponent> =
        new QueryList<LogoComponent>();

    collapseMenuActive = false;
    showSlideMenu = true;
    curLanguage!: string;

    @Input() userAvatar: any;

    @HostListener("window:resize")
    resize(): void {
        this.showSlideMenu = document.body.clientWidth < 1024 ? false : true;
        this.setSlideBarStyle();
    }

    constructor(private sanitizer: DomSanitizer) {}

    ngOnInit(): void {
        this.showSlideMenu = document.body.clientWidth < 1024 ? false : true;
        this.setSlideBarStyle();
        this.repoLink = this.sanitizer.bypassSecurityTrustResourceUrl(
            `https://ghbtns.com/github-btn.html?user=DevCloudFE&repo=${this.repoName}&type=star&count=true`
        );
    }

    toggleMenu($event: any): void {
        this.collapseMenuActive = !this.collapseMenuActive;
        $event;
    }

    clickSlideMenu(showMenu?: boolean): void {
        this.showSlideMenu =
            typeof showMenu === "boolean" ? showMenu : !this.showSlideMenu;
        this.setSlideBarStyle();
    }

    setSlideBarStyle(): void {
        const ele = document.querySelector(".sidebar-wrapper");
        if (ele) {
            ele.setAttribute(
                "style",
                `max-width: ${this.showSlideMenu ? "260px" : "0"}`
            );
        }
    }
}
