import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { resolveRuntimeConfig } from "./generate-runtime-config.mjs";

describe("resolveRuntimeConfig", () => {
  let warn;
  beforeEach(() => {
    warn = mock.method(console, "warn", () => {});
  });
  afterEach(() => mock.restoreAll());

  it("falls back to the production values when nothing is set", () => {
    const config = resolveRuntimeConfig({});
    assert.equal(config.backendUrl, "https://api-community.mlptf.org.my/");
    assert.equal(config.backendGraphqlUrl, "https://api-community.mlptf.org.my/graphql/");
    assert.equal(config.environmentName, "production");
    assert.equal(config.uploadConcurrency, 5);
    assert.equal(config.fcmVapidKey, "");
    assert.equal(warn.mock.callCount(), 0);
  });

  it("uses the provided values", () => {
    const config = resolveRuntimeConfig({
      BACKEND_URL: "https://staging.example/",
      BACKEND_GRAPHQL_URL: "https://staging.example/graphql/",
      MAPBOX_TOKEN: "pk.test",
      CAPTCHA_SITE_KEY: "captcha",
      ENVIRONMENT_NAME: "staging",
      UPLOAD_CONCURRENCY: "8",
      FCM_VAPID_KEY: "vapid",
    });
    assert.deepEqual(config, {
      backendUrl: "https://staging.example/",
      backendGraphqlUrl: "https://staging.example/graphql/",
      mapboxToken: "pk.test",
      captchaSiteKey: "captcha",
      environmentName: "staging",
      uploadConcurrency: 8,
      fcmVapidKey: "vapid",
    });
    assert.equal(warn.mock.callCount(), 0);
  });

  it("treats empty strings as unset", () => {
    const config = resolveRuntimeConfig({
      BACKEND_URL: "",
      BACKEND_GRAPHQL_URL: "",
      MAPBOX_TOKEN: "",
      CAPTCHA_SITE_KEY: "",
      ENVIRONMENT_NAME: "",
      UPLOAD_CONCURRENCY: "",
      FCM_VAPID_KEY: "",
    });
    assert.deepEqual(config, resolveRuntimeConfig({}));
    assert.equal(warn.mock.callCount(), 0);
  });

  for (const bad of ["abc", "1.5", "0", "-3", "NaN", "5 apples"]) {
    it(`falls back to 5 with a warning for UPLOAD_CONCURRENCY=${JSON.stringify(bad)}`, () => {
      const config = resolveRuntimeConfig({ UPLOAD_CONCURRENCY: bad });
      assert.equal(config.uploadConcurrency, 5);
      assert.equal(warn.mock.callCount(), 1);
      assert.match(warn.mock.calls[0].arguments[0], /UPLOAD_CONCURRENCY/);
    });
  }
});
