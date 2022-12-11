import { ButtonModule } from "ng-devui/button";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import { FallbackComponent } from "./fallback.component";

@NgModule({
    declarations: [FallbackComponent],
    imports: [CommonModule, ButtonModule],
})
export class FallbackModule {}
