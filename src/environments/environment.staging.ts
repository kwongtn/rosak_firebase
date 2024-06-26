export const environment = {
    production: true,
    backendUrl: "https://rosak-staging.kwongtn.xyz/",
    backendGraphqlUrl: "https://rosak-staging.kwongtn.xyz/graphql/",
    firebase: {
        apiKey: "AIzaSyC6Z81AaCJ-PLofq0N0Ize43oWMqKKW-zA",
        authDomain: "rosak-7223b.firebaseapp.com",
        projectId: "rosak-7223b",
        storageBucket: "rosak-7223b.appspot.com",
        messagingSenderId: "840290622352",
        appId: "1:840290622352: web:8ad6a7ca995f17042af115",
        measurementId: "G-QSNS80GX8D",
    },
    sentry: {
        dsn: "https://239abe11366d4590a1c1ebd5260c63e2@o1331817.ingest.sentry.io/6596136",
        tunnel: "https://rosak-staging.kwongtn.xyz/sentry/",
        tracingOrigins: [
            "https://rosak-7223b.web.app",
            "https://rosak-7223b.firebaseapp.com",
        ],
        environment: "staging",
    },
    captcha: {
        key: "6Le4ekQhAAAAAKu_C7LTyylJfe8Q8Gv5fiNFx_kj",
    },
    semaphore: {
        badgeKey: "5ffc64e2-f67b-4205-8bcd-f5f5f076e385",
    },
    mapbox: {
        token: "pk.eyJ1Ijoia3dvbmd0biIsImEiOiJjbHd3eDlibHUxMGV0MmxzN2E0eG04MGl0In0.LVf9Nq5laopxg5y4hy8i_w",
    },
    upload: {
        concurrency: 10,
    },
};
