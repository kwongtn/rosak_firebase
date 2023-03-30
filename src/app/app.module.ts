import { DevUIModule } from "ng-devui";
import { DEVUI_LANG, EN_US, I18nService } from "ng-devui/i18n";
import {
    RECAPTCHA_V3_SITE_KEY,
    RecaptchaFormsModule,
    RecaptchaV3Module,
    ReCaptchaV3Service,
} from "ng-recaptcha";
import { en_US, NZ_I18N } from "ng-zorro-antd/i18n";
import { NzMessageModule } from "ng-zorro-antd/message";
import { NzNotificationModule } from "ng-zorro-antd/notification";

import { registerLocaleData } from "@angular/common";
import { HttpClientModule } from "@angular/common/http";
import en from "@angular/common/locales/en";
import { APP_INITIALIZER, ErrorHandler, NgModule } from "@angular/core";
import { AngularFireModule } from "@angular/fire/compat";
import {
    AngularFireAnalyticsModule,
    CONFIG,
    ScreenTrackingService,
    UserTrackingService,
} from "@angular/fire/compat/analytics";
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

import build from "../build";
import { environment } from "../environments/environment";
import { AppRoutingModule } from "./app-routing.module";
import { AppComponent } from "./app.component";
import { GraphQLModule } from "./graphql.module";
import { HeaderModule } from "./header/header.module";

registerLocaleData(en);

const imports: any[] = [
    // AngularFire
    AngularFireModule.initializeApp(environment.firebase),
    AngularFireAnalyticsModule,
    AngularFireAuthModule,
    AngularFireDatabaseModule,
    AngularFireStorageModule,
    AngularFirestoreModule,

    // Angular
    BrowserAnimationsModule,
    BrowserModule,
    HttpClientModule,

    // DevUI
    DevUIModule,

    // ng-zorro
    NzMessageModule,
    NzNotificationModule,

    // Internal Imports
    AppRoutingModule,
    GraphQLModule,
    HeaderModule,

    // Other Services
    RecaptchaFormsModule,
    RecaptchaV3Module,
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
    { provide: NZ_I18N, useValue: en_US },
];

if (environment.production) {
    imports.push(AngularFireAnalyticsModule, AngularFirePerformanceModule);
    providers.push(
        PerformanceMonitoringService,
        ScreenTrackingService,
        UserTrackingService,
        {
            provide: CONFIG,
            useValue: {
                APP_VERSION: build.git.hash,
            },
        }
    );
}

@NgModule({
    declarations: [AppComponent],
    imports: imports,
    providers: providers,
    bootstrap: [AppComponent],
})
export class AppModule {}
