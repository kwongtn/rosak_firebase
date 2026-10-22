import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { resolveFirebaseConfig } from "./generate-firebase-config.mjs";

const fallback = resolveFirebaseConfig({});
const full = {
  apiKey: "key",
  authDomain: "other.firebaseapp.com",
  projectId: "other",
  storageBucket: "other.appspot.com",
  messagingSenderId: "1",
  appId: "1:1:web:abc",
  measurementId: "G-OTHER",
};

describe("resolveFirebaseConfig", () => {
  let warn;
  beforeEach(() => {
    warn = mock.method(console, "warn", () => {});
  });
  afterEach(() => mock.restoreAll());

  it("falls back to the built-in project when FIREBASE_WEBAPP_CONFIG is unset or empty", () => {
    assert.equal(fallback.projectId, "rosak-7223b");
    assert.deepEqual(resolveFirebaseConfig({ FIREBASE_WEBAPP_CONFIG: "" }), fallback);
    assert.equal(warn.mock.callCount(), 0);
  });

  it("uses a complete config as given", () => {
    const config = resolveFirebaseConfig({ FIREBASE_WEBAPP_CONFIG: JSON.stringify(full) });
    assert.deepEqual(config, full);
    assert.equal(warn.mock.callCount(), 0);
  });

  it("fills a missing field from the fallback without a warning", () => {
    const { measurementId, ...partial } = full;
    const config = resolveFirebaseConfig({ FIREBASE_WEBAPP_CONFIG: JSON.stringify(partial) });
    assert.equal(config.projectId, "other");
    assert.equal(config.measurementId, fallback.measurementId);
    assert.equal(warn.mock.callCount(), 0);
  });

  it("falls back per field, with a warning, for an empty or wrongly typed value", () => {
    const config = resolveFirebaseConfig({
      FIREBASE_WEBAPP_CONFIG: JSON.stringify({ ...full, apiKey: "", appId: 42 }),
    });
    assert.equal(config.apiKey, fallback.apiKey);
    assert.equal(config.appId, fallback.appId);
    assert.equal(config.projectId, "other");
    assert.equal(warn.mock.callCount(), 2);
  });

  it("keeps extra fields the SDK config carries", () => {
    const config = resolveFirebaseConfig({
      FIREBASE_WEBAPP_CONFIG: JSON.stringify({ ...full, databaseURL: "https://db.example" }),
    });
    assert.equal(config.databaseURL, "https://db.example");
  });

  for (const [name, raw] of [
    ["invalid JSON", "{not json"],
    ["null", "null"],
    ["an array", "[]"],
    ["a string", '"x"'],
  ]) {
    it(`falls back with a warning for ${name}`, () => {
      assert.deepEqual(resolveFirebaseConfig({ FIREBASE_WEBAPP_CONFIG: raw }), fallback);
      assert.equal(warn.mock.callCount(), 1);
    });
  }
});
