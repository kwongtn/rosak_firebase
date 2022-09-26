import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";

import {
    ConsoleEventsTableComponent,
} from "./events-table/events-table.component";
import { ConsoleMainComponent } from "./main/main.component";

@NgModule({
    declarations: [ConsoleMainComponent, ConsoleEventsTableComponent],
    imports: [CommonModule],
})
export class ConsoleModule {}
