import { ButtonModule } from "ng-devui/button";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import { ConstructionComponent } from "./construction.component";

@NgModule({
    declarations: [ConstructionComponent],
    imports: [CommonModule, ButtonModule],
})
export class ConstructionModule {}
