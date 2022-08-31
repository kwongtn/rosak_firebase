import "./polyfills";

import {
    devuiGreenTheme,
    devuiLightTheme,
    ThemeServiceInit,
} from "ng-devui/theme";
import {
    deepTheme,
    infinityTheme,
    provenceTheme,
} from "ng-devui/theme-collection";

import { enableProdMode } from "@angular/core";
import { platformBrowserDynamic } from "@angular/platform-browser-dynamic";
import * as Sentry from "@sentry/angular";
import { BrowserTracing } from "@sentry/tracing";

import { AppModule } from "./app/app.module";
import { environment } from "./environments/environment";

Sentry.init({
    dsn: environment.sentry.dsn,
    tunnel: environment.sentry.tunnel,
    integrations: [
        new BrowserTracing({
            tracingOrigins: environment.sentry.tracingOrigins,
            routingInstrumentation: Sentry.routingInstrumentation,
        }),
    ],

    // Set tracesSampleRate to 1.0 to capture 100%
    // of transactions for performance monitoring.
    // We recommend adjusting this value in production
    tracesSampleRate: 1.0,
});
if (environment.production) {
    enableProdMode();
}

ThemeServiceInit(
    {
        "devui-light-theme": devuiLightTheme,
        "infinity-theme": infinityTheme,
        // devuiLightTheme: devuiLightTheme,
        "devui-green-theme": devuiGreenTheme,
        "devui-deep-theme": deepTheme,
        "devui-provence-theme": provenceTheme,
        // devuiDarkTheme: devuiDarkTheme,
        // avenueuiGreenDarkTheme: avenueuiGreenDarkTheme,
        // galaxyTheme: galaxyTheme,
    },
    "devui-provence-theme",
    undefined,
    undefined,
    true
);

platformBrowserDynamic()
    .bootstrapModule(AppModule)
    .catch((err) => console.error(err));
