import { AvatarModule } from "ng-devui/avatar";
import { BadgeModule } from "ng-devui/badge";
import { TooltipModule } from "ng-devui/tooltip";
import { NzAlertModule } from "ng-zorro-antd/alert";
import { NzAvatarModule } from "ng-zorro-antd/avatar";
import { NzBadgeModule } from "ng-zorro-antd/badge";
import { NzButtonModule } from "ng-zorro-antd/button";
import { NzCardModule } from "ng-zorro-antd/card";
import { NzDrawerModule } from "ng-zorro-antd/drawer";
import { NzIconModule } from "ng-zorro-antd/icon";
import { NzSpaceModule } from "ng-zorro-antd/space";
import { NzSwitchModule } from "ng-zorro-antd/switch";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterModule } from "@angular/router";

import {
    VerificationCodeCardModule,
} from "../@ui/verification-code-card/verification-code-card.module";
import { HeaderComponent } from "./header.component";
import {
    LoginDropdownComponent,
} from "./login-dropdown/login-dropdown.component";
import { LogoComponent } from "./logo/logo.component";
import { MenuComponent } from "./menu/menu.component";

@NgModule({
    declarations: [
        HeaderComponent,
        LogoComponent,
        MenuComponent,
        LoginDropdownComponent,
    ],
    imports: [
        CommonModule,
        FormsModule,
        RouterModule,

        // DevUI
        AvatarModule,
        BadgeModule,
        TooltipModule,

        // Ng-Zorro
        NzAlertModule,
        NzAvatarModule,
        NzBadgeModule,
        NzButtonModule,
        NzCardModule,
        NzDrawerModule,
        NzIconModule,
        NzSpaceModule,
        NzSwitchModule,

        // Self Imports
        VerificationCodeCardModule,
    ],
    exports: [HeaderComponent, LogoComponent, MenuComponent],
})
export class HeaderModule {}
