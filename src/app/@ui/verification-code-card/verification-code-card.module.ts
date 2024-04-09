import { NzButtonModule } from "ng-zorro-antd/button";
import { NzCardModule } from "ng-zorro-antd/card";
import { NzIconModule } from "ng-zorro-antd/icon";
import { NzStatisticModule } from "ng-zorro-antd/statistic";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import {
    VerificationCodeCardComponent,
} from "./verification-code-card.component";

@NgModule({
    declarations: [VerificationCodeCardComponent],
    imports: [
        CommonModule, NzStatisticModule, NzCardModule, NzButtonModule, NzIconModule,
    ],
    exports: [VerificationCodeCardComponent],
})
export class VerificationCodeCardModule { }
