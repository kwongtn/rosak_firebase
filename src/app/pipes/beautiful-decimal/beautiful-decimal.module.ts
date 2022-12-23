import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import {
    BeautifulDecimalPipe,
} from "../beautiful-decimal/beautiful-decimal.pipe";

@NgModule({
    declarations: [BeautifulDecimalPipe],
    imports: [CommonModule],
    exports: [BeautifulDecimalPipe],
})
export class BeautifulDecimalModule {}
