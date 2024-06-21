/* eslint-disable @typescript-eslint/no-var-requires */
// const { sentryWebpackPlugin } = require("@sentry/webpack-plugin");
const { BundleAnalyzerPlugin } = require("webpack-bundle-analyzer");
const { codecovWebpackPlugin } = require("@codecov/webpack-plugin");

module.exports = {
    devtool: "source-map", // Source map generation must be turned on
    plugins: [
        // sentryWebpackPlugin({
        //     org: process.env.SENTRY_ORG,
        //     project: process.env.SENTRY_PROJECT,

        //     // Specify the directory containing build artifacts
        //     include: "./dist",

        //     // Auth tokens can be obtained from https://sentry.io/settings/account/api/auth-tokens/
        //     // and needs the `project:releases` and `org:read` scopes
        //     authToken: process.env.SENTRY_AUTH_TOKEN,

        //     // Optionally uncomment the line below to override automatic release name detection
        //     // release: process.env.RELEASE,
        // }),
        new BundleAnalyzerPlugin({
            analyzerMode: "static",
            reportFilename: "bundle-report.html",
            openAnalyzer: false,
        }), 
        codecovWebpackPlugin({
            enableBundleAnalysis: process.env.CODECOV_TOKEN !== undefined,
            bundleName: "rosak_firebase",
            uploadToken: process.env.CODECOV_TOKEN,
        }),
    ],
};
