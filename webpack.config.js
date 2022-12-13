/* eslint-disable @typescript-eslint/no-var-requires */
const SentryWebpackPlugin = require("@sentry/webpack-plugin");

module.exports = {
    devtool: "source-map", // Source map generation must be turned on
    plugins: [
        new SentryWebpackPlugin({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,

            // Specify the directory containing build artifacts
            include: "./dist",

            // Auth tokens can be obtained from https://sentry.io/settings/account/api/auth-tokens/
            // and needs the `project:releases` and `org:read` scopes
            authToken: process.env.SENTRY_AUTH_TOKEN,

            // Optionally uncomment the line below to override automatic release name detection
            // release: process.env.RELEASE,
        }),
    ],
};
