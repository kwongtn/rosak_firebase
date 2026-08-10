import { Environment } from "./environment.model";

export const environment: Environment = {
    production: true,
    backendUrl: "https://api-community.mlptf.org.my/",
    backendGraphqlUrl: "https://api-community.mlptf.org.my/graphql/",
    firebase: {
        apiKey: "AIzaSyC6Z81AaCJ-PLofq0N0Ize43oWMqKKW-zA",
        authDomain: "rosak-7223b.firebaseapp.com",
        projectId: "rosak-7223b",
        storageBucket: "rosak-7223b.appspot.com",
        messagingSenderId: "840290622352",
        appId: "1:840290622352:web:8ad6a7ca995f17042af115",
        measurementId: "G-QSNS80GX8D",
    },
    upload: {
        concurrency: 5,
    },
    captcha: {
        siteKey: "6Le4ekQhAAAAAKu_C7LTyylJfe8Q8Gv5fiNFx_kj",
    },
    mapbox: {
        token: "pk.eyJ1Ijoia3dvbmd0biIsImEiOiJjbHd3eGIxazEwd2tsMm5yM3NyYmt4b2s4In0.l1ThIQzGXxoPDY3VyMtC-Q",
    },
    sentry: {
        // Same project the old app reports to (see the repo root's own environment.prod.ts) —
        // errors from both apps land in one place during the side-by-side rewrite period,
        // distinguished by the `app` tag set at init (see main.ts) rather than by a separate
        // project, which would otherwise need a brand new DSN provisioned before this could ship.
        dsn: "https://239abe11366d4590a1c1ebd5260c63e2@o1331817.ingest.sentry.io/6596136",
        tunnel: "https://api-community.mlptf.org.my/sentry/",
    },
};
