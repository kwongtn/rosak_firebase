import { DevUIModule } from "ng-devui";
import { ToastModule } from "ng-devui/toast";

import { HttpClientModule } from "@angular/common/http";
import { NgModule } from "@angular/core";
import { BrowserModule } from "@angular/platform-browser";
import { BrowserAnimationsModule } from "@angular/platform-browser/animations";

import { AppRoutingModule } from "./app-routing.module";
import { AppComponent } from "./app.component";
import { GraphQLModule } from "./graphql.module";
import { HeaderModule } from "./header/header.module";
import { SpottingModule } from "./spotting/spotting.module";

@NgModule({
    declarations: [AppComponent],
    imports: [
        BrowserModule,
        AppRoutingModule,
        BrowserAnimationsModule,
        DevUIModule,
        SpottingModule,
        GraphQLModule,
        HttpClientModule,
        ToastModule,
        HeaderModule,
    ],
    providers: [],
    bootstrap: [AppComponent],
})
export class AppModule {}
