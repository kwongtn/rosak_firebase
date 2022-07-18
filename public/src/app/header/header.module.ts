import { AvatarModule } from "ng-devui/avatar";
import { DropDownModule } from "ng-devui/dropdown";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { RouterModule } from "@angular/router";

import { HeaderComponent } from "./header/header.component";
import { LogoComponent } from "./logo/logo.component";
import { MenuComponent } from "./menu/menu.component";

@NgModule({
    declarations: [HeaderComponent, LogoComponent, MenuComponent],
    imports: [CommonModule, AvatarModule, DropDownModule, RouterModule],
    exports: [HeaderComponent, LogoComponent, MenuComponent],
})
export class HeaderModule {}
