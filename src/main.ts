import "./polyfills";

import {
    devuiDarkTheme,
    devuiLightTheme,
    ThemeServiceInit,
} from "ng-devui/theme";
import {
    deepTheme,
    galaxyTheme,
    infinityTheme,
    provenceTheme,
    sweetTheme,
} from "ng-devui/theme-collection";

import { enableProdMode } from "@angular/core";
import { platformBrowserDynamic } from "@angular/platform-browser-dynamic";
import * as Sentry from "@sentry/angular";
import { Replay } from "@sentry/replay";
import { BrowserTracing } from "@sentry/tracing";

import { AppModule } from "./app/app.module";
import {
    devuiLargeFontTheme,
    greenDarkTheme,
    greenLightTheme,
} from "./app/header/theme-picker/theme-data-more";
import { environment } from "./environments/environment";

Sentry.init({
    dsn: environment.sentry.dsn,
    tunnel: environment.sentry.tunnel,
    integrations: [
        new BrowserTracing({
            tracingOrigins: environment.sentry.tracingOrigins,
            routingInstrumentation: Sentry.routingInstrumentation,
        }),
        new Replay(),
    ],

    // Set tracesSampleRate to 1.0 to capture 100%
    // of transactions for performance monitoring.
    // We recommend adjusting this value in production
    tracesSampleRate: 1.0,

    // This sets the sample rate to be 10%. You may want this to be 100% while
    // in development and sample at a lower rate in production
    replaysSessionSampleRate: 0.1,

    // If the entire session is not sampled, use the below sample rate to sample
    // sessions when an error occurs.
    replaysOnErrorSampleRate: 1.0,
});
if (environment.production) {
    enableProdMode();
}

ThemeServiceInit(
    {
        "devui-light-theme": devuiLightTheme,
        "devui-dark-theme": devuiDarkTheme,
        "green-light-theme": greenLightTheme,
        "green-dark-theme": greenDarkTheme,
        "devui-large-font-theme": devuiLargeFontTheme,
        "infinity-theme": infinityTheme,
        "provence-theme": provenceTheme,
        "sweet-theme": sweetTheme,
        "deep-theme": deepTheme,
        "galaxy-theme": galaxyTheme,
    },
    "infinity-theme",
    undefined,
    undefined,
    true
);

platformBrowserDynamic()
    .bootstrapModule(AppModule)
    .catch((err) => console.error(err));
