import { DevUIModule } from "ng-devui";
import { DEVUI_LANG, EN_US, I18nService } from "ng-devui/i18n";
import {
    RECAPTCHA_V3_SITE_KEY,
    RecaptchaFormsModule,
    RecaptchaV3Module,
    ReCaptchaV3Service,
} from "ng-recaptcha-2";
import { NzAlertModule } from "ng-zorro-antd/alert";
import { NzDrawerService } from "ng-zorro-antd/drawer";
import { en_US, NZ_I18N } from "ng-zorro-antd/i18n";
import { NzImageService } from "ng-zorro-antd/image";
import { NzMessageModule } from "ng-zorro-antd/message";
import { NzModalService } from "ng-zorro-antd/modal";
import { NzNotificationModule } from "ng-zorro-antd/notification";
import { MarkdownModule, provideMarkdown } from "ngx-markdown";

import { registerLocaleData } from "@angular/common";
import { provideHttpClient } from "@angular/common/http";
import en from "@angular/common/locales/en";
import { APP_INITIALIZER, ErrorHandler, NgModule } from "@angular/core";
import {
    getAnalytics,
    provideAnalytics,
    ScreenTrackingService,
    UserTrackingService,
} from "@angular/fire/analytics";
import { initializeApp, provideFirebaseApp } from "@angular/fire/app";
import { getAuth, provideAuth } from "@angular/fire/auth";
import { getDatabase, provideDatabase } from "@angular/fire/database";
import { getFirestore, provideFirestore } from "@angular/fire/firestore";
import { getPerformance, providePerformance } from "@angular/fire/performance";
import { getStorage, provideStorage } from "@angular/fire/storage";
import { BrowserModule } from "@angular/platform-browser";
import { BrowserAnimationsModule } from "@angular/platform-browser/animations";
import { Router } from "@angular/router";
import * as Sentry from "@sentry/angular";

import { environment } from "../environments/environment";
import { FooterComponent } from "./@ui/footer/footer.component";
import { AppRoutingModule } from "./app-routing.module";
import { AppComponent } from "./app.component";
import { GlobalErrorHandler } from "./error-handler";
import { GraphQLModule } from "./graphql.module";
import { HeaderModule } from "./header/header.module";

registerLocaleData(en);

const imports: any[] = [
    // Angular
    BrowserAnimationsModule,
    BrowserModule,

    // DevUI
    DevUIModule,

    // ng-zorro
    NzAlertModule,
    NzMessageModule,
    NzNotificationModule,

    // Internal Imports
    AppRoutingModule,
    GraphQLModule,
    HeaderModule,
    FooterComponent,

    // Other Services
    RecaptchaFormsModule,
    RecaptchaV3Module,
    MarkdownModule.forRoot(),
];

const providers: any[] = [
    {
        provide: ErrorHandler,
        useClass: GlobalErrorHandler,
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
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAnalytics(() => getAnalytics()),
    provideFirestore(() => getFirestore()),
    provideAuth(() => getAuth()),
    provideDatabase(() => getDatabase()),
    provideStorage(() => getStorage()),
    provideMarkdown(),
    provideHttpClient(),
    NzModalService,
    NzImageService,
    NzDrawerService,
];

if (environment.production) {
    providers.push(
        ScreenTrackingService,
        UserTrackingService,
        provideAnalytics(() => getAnalytics()),
        providePerformance(() => getPerformance())
        // {
        //     provide: CONFIG,
        //     useValue: {
        //         APP_VERSION: build.git.hash,
        //     },
        // }
    );
}

@NgModule({
    declarations: [AppComponent],
    imports: imports,
    providers: providers,
    bootstrap: [AppComponent],
})
export class AppModule {}
