import { NzListModule } from "ng-zorro-antd/list";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import { ActionListComponent } from "./action-list.component";

@NgModule({
    declarations: [ActionListComponent],
    imports: [CommonModule, NzListModule],
    exports: [ActionListComponent],
})
export class ActionListModule {
}
