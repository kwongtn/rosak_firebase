export interface Environment {
    production: boolean;
    backendUrl: string;
    backendGraphqlUrl: string;
    firebase: {
        apiKey: string;
        authDomain: string;
        projectId: string;
        storageBucket: string;
        messagingSenderId: string;
        appId: string;
        measurementId: string;
    };
    upload: {
        concurrency: number;
    };
    captcha: {
        siteKey: string;
    };
    mapbox: {
        token: string;
    };
    sentry: {
        /** `undefined` makes the SDK a safe no-op (see environment.development.ts) — local dev
         * doesn't need its own separate enable/disable flag on top of this. */
        dsn: string | undefined;
        /** Routes Sentry envelopes through the backend instead of hitting sentry.io directly —
         * avoids ad-/tracker-blockers (which commonly block "sentry.io" by name) silently
         * dropping error reports client-side. `undefined` in dev, where there's no matching
         * local backend route to receive it. */
        tunnel: string | undefined;
    };
}
