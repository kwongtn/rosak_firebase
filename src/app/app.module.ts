import { DevUIModule } from "ng-devui";
import { DEVUI_LANG, EN_US, I18nService } from "ng-devui/i18n";
import { ToastModule } from "ng-devui/toast";
import {
    RECAPTCHA_V3_SITE_KEY,
    RecaptchaFormsModule,
    RecaptchaV3Module,
    ReCaptchaV3Service,
} from "ng-recaptcha";

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

const imports: any[] = [
    // TODO: AnalyticsModule
    AngularFireModule.initializeApp(environment.firebase),
    AngularFireAuthModule,
    AngularFirestoreModule,
    AngularFireStorageModule,
    AngularFireDatabaseModule,
    BrowserModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    DevUIModule,
    GraphQLModule,
    HttpClientModule,
    ToastModule,
    HeaderModule,
    RecaptchaV3Module,
    RecaptchaFormsModule,
];

const providers: any[] = [
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
    ReCaptchaV3Service,
    { provide: RECAPTCHA_V3_SITE_KEY, useValue: environment.captcha.key },
    {
        provide: DEVUI_LANG,
        useValue: EN_US,
    },
    I18nService,
];

if (environment.production) {
    imports.push(AngularFirePerformanceModule);
    providers.push(PerformanceMonitoringService);
}

@NgModule({
    declarations: [AppComponent],
    imports: imports,
    providers: providers,
    bootstrap: [AppComponent],
})
export class AppModule {}
