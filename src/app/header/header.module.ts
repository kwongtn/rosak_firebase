import { AvatarModule } from "ng-devui/avatar";
import { BadgeModule } from "ng-devui/badge";
import { ButtonModule } from "ng-devui/button";
import { CardModule } from "ng-devui/card";
import { DropDownModule } from "ng-devui/dropdown";
import { TooltipModule } from "ng-devui/tooltip";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { RouterModule } from "@angular/router";

import { HeaderComponent } from "./header/header.component";
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
        AvatarModule,
        DropDownModule,
        RouterModule,
        BadgeModule,
        TooltipModule,
        CardModule,
        ButtonModule,
    ],
    exports: [HeaderComponent, LogoComponent, MenuComponent],
})
export class HeaderModule {}
