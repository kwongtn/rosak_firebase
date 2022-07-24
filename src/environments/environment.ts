// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
    production: false,
    backendGraphqlUrl: "http://localhost:8000/graphql/",
    firebase: {
        apiKey: "AIzaSyC6Z81AaCJ-PLofq0N0Ize43oWMqKKW-zA",
        authDomain: "rosak-7223b.firebaseapp.com",
        projectId: "rosak-7223b",
        storageBucket: "rosak-7223b.appspot.com",
        messagingSenderId: "840290622352",
        appId: "1:840290622352:web:8ad6a7ca995f17042af115",
        measurementId: "G-QSNS80GX8D",
    },
    sentry: {
        dsn: undefined,
        tunnel: undefined,
        tracingOrigins: [
            "http://localhost:4200",
            "https://lift-rosak.ddns.net:8000",
        ]
    },
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
