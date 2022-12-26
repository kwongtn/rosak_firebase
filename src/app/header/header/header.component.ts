import { AuthService } from "src/app/services/auth/auth.service";

import {
    Component,
    ContentChildren,
    HostListener,
    Input,
    OnInit,
    QueryList,
} from "@angular/core";

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
    @Input() showSlideButton = false;

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

    constructor(public authService: AuthService) {}

    ngOnInit(): void {
        this.showSlideMenu = document.body.clientWidth < 1024 ? false : true;
        this.setSlideBarStyle();
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
