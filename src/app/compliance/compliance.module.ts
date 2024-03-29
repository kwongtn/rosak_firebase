import { PanelModule } from "ng-devui";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import { GdprComponent } from "./gdpr/gdpr.component";
import { MainComponent } from "./main/main.component";

@NgModule({
    declarations: [MainComponent, GdprComponent],
    imports: [CommonModule, PanelModule],
})
export class ComplianceModule {}
