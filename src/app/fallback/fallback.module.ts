import { NzButtonModule } from "ng-zorro-antd/button";
import { NzResultModule } from "ng-zorro-antd/result";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import { FallbackComponent } from "./fallback.component";

@NgModule({
    declarations: [FallbackComponent],
    imports: [CommonModule, NzButtonModule, NzResultModule],
})
export class FallbackModule {}
