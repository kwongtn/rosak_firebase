import { NzIconModule } from "ng-zorro-antd/icon";
import { NzLayoutModule } from "ng-zorro-antd/layout";
import { NzMenuModule } from "ng-zorro-antd/menu";
import { FooterModule } from "src/app/@ui/footer/footer.module";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import { SituasiComponent } from "./situasi.component";

@NgModule({
    declarations: [SituasiComponent],
    imports: [
        CommonModule,
        NzIconModule,
        NzLayoutModule,
        NzMenuModule,
        FooterModule,
    ],
})
export class SituasiModule {}
