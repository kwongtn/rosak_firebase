import { NzDrawerRef, NzDrawerService } from "ng-zorro-antd/drawer";
import { AuthService } from "src/app/services/auth/auth.service";
import { environment as env } from "src/environments/environment";

import {
    Component,
    ContentChildren,
    HostListener,
    Input,
    OnInit,
    QueryList,
} from "@angular/core";

import {
    LoginDropdownComponent,
} from "./login-dropdown/login-dropdown.component";
import { LogoComponent } from "./logo/logo.component";

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

    environment = env;

    @ContentChildren(LogoComponent) subLogo: QueryList<LogoComponent> =
        new QueryList<LogoComponent>();

    collapseMenuActive = false;
    showSlideMenu = true;
    curLanguage!: string;

    drawerRef!: NzDrawerRef<LoginDropdownComponent, string>;
    @Input() userAvatar: any;

    @HostListener("window:resize")
    resize(): void {
        this.showSlideMenu = document.body.clientWidth < 1024 ? false : true;
        this.setSlideBarStyle();
    }

    constructor(
        public authService: AuthService,
        private drawerService: NzDrawerService
    ) {}

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

    onLoginIconClick() {
        this.drawerRef = this.drawerService.create<
            LoginDropdownComponent,
            { value: string },
            string
        >({
            nzTitle: "Login",
            // nzFooter: this.isMine ? this.drawerFooter : undefined,
            // nzExtra: 'Extra',
            // nzWidth: this.width,
            nzContent: LoginDropdownComponent,
            nzContentParams: {
                userAvatar: this.userAvatar,
            },
        });
    }
}
