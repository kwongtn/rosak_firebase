
import { AvatarModule } from "ng-devui/avatar";
import { BadgeModule } from "ng-devui/badge";
import { ButtonModule } from "ng-devui/button";
import { CardModule } from "ng-devui/card";
import { DropDownModule } from "ng-devui/dropdown";
import { TooltipModule } from "ng-devui/tooltip";
import { NzAlertModule } from "ng-zorro-antd/alert";
import { NzBadgeModule } from "ng-zorro-antd/badge";
import { NzIconModule } from "ng-zorro-antd/icon";
import { NzSwitchModule } from "ng-zorro-antd/switch";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterModule } from "@angular/router";

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
        ButtonModule,
        CardModule,
        DropDownModule,
        TooltipModule,

        // Ng-Zorro
        NzAlertModule,
        NzBadgeModule,
        NzIconModule,
        NzSwitchModule,
    ],
    exports: [HeaderComponent, LogoComponent, MenuComponent],
})
export class HeaderModule {}
