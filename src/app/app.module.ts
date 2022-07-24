import { DevUIModule } from "ng-devui";
import { ToastModule } from "ng-devui/toast";

import { HttpClientModule } from "@angular/common/http";
import { APP_INITIALIZER, ErrorHandler, NgModule } from "@angular/core";
import { AngularFireModule } from "@angular/fire/compat";
import { AngularFireAuthModule } from "@angular/fire/compat/auth";
import { AngularFireDatabaseModule } from "@angular/fire/compat/database";
import { AngularFirestoreModule } from "@angular/fire/compat/firestore";
import {
    AngularFirePerformanceModule,
    PerformanceMonitoringService,
} from "@angular/fire/compat/performance";
import { AngularFireStorageModule } from "@angular/fire/compat/storage";
import { BrowserModule } from "@angular/platform-browser";
import { BrowserAnimationsModule } from "@angular/platform-browser/animations";
import { Router } from "@angular/router";
import * as Sentry from "@sentry/angular";

import { environment } from "../environments/environment";
import { AppRoutingModule } from "./app-routing.module";
import { AppComponent } from "./app.component";
import { GraphQLModule } from "./graphql.module";
import { HeaderModule } from "./header/header.module";

@NgModule({
    declarations: [AppComponent],
    imports: [
        // TODO: AnalyticsModule
        AngularFireModule.initializeApp(environment.firebase),
        AngularFireAuthModule,
        AngularFirestoreModule,
        AngularFireStorageModule,
        AngularFireDatabaseModule,
        AngularFirePerformanceModule,
        BrowserModule,
        AppRoutingModule,
        BrowserAnimationsModule,
        DevUIModule,
        GraphQLModule,
        HttpClientModule,
        ToastModule,
        HeaderModule,
    ],
    providers: [
        {
            provide: ErrorHandler,
            useValue: Sentry.createErrorHandler({
                showDialog: true,
            }),
        },
        {
            provide: Sentry.TraceService,
            deps: [Router],
        },
        {
            provide: APP_INITIALIZER,
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            useFactory: () => () => {},
            deps: [Sentry.TraceService],
            multi: true,
        },
        PerformanceMonitoringService,
    ],
    bootstrap: [AppComponent],
})
export class AppModule {}
