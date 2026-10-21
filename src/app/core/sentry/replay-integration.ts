// main.ts loads this file with a dynamic import() once the browser is idle, so Session Replay's code
// ships as a chunk of its own instead of with the first load.
//
// The "?lazy" is what makes that true. @sentry/browser's barrel links @sentry/replay statically,
// and esbuild gives a whole module to every chunk that can reach it, so a plain import of the real
// package from here still lands in the first-load bundle (measured: same bytes either way).
// A query string makes the bundler treat the file as a private copy that only this module reaches;
// the original is then unreferenced and tree-shaken away. See lazy-modules.d.ts for the types.
// (Not lazyLoadIntegration(): that fetches Sentry's CDN bundles, which is for script-tag installs.)
export { replayIntegration } from "@sentry/replay?lazy";
