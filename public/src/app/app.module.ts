import { DevUIModule } from "ng-devui";

import { NgModule } from "@angular/core";
import { BrowserModule } from "@angular/platform-browser";
import { BrowserAnimationsModule } from "@angular/platform-browser/animations";

import { AppRoutingModule } from "./app-routing.module";
import { AppComponent } from "./app.component";
import { SpottingModule } from "./spotting/spotting.module";

@NgModule({
    declarations: [AppComponent],
    imports: [
        BrowserModule,
        AppRoutingModule,
        BrowserAnimationsModule,
        DevUIModule,
        SpottingModule,
    ],
    providers: [],
    bootstrap: [AppComponent],
})
export class AppModule {}
