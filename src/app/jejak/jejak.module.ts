import { NzSliderModule } from "ng-zorro-antd/slider";
import { NzSpinModule } from "ng-zorro-antd/spin";

import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { FormsModule } from "@angular/forms";

import { JejakMainComponent } from "./main/main.component";

@NgModule({
    declarations: [JejakMainComponent],
    imports: [CommonModule, NzSliderModule, NzSpinModule, FormsModule],
})
export class JejakModule {}
