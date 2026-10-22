import type { Page } from "@playwright/test";

import { firebaseConfig } from "../../src/environments/firebase-config.generated";

export const E2E_UID = "e2e-uid";
export const E2E_DISPLAY_NAME = "E2E Rider";
export const E2E_EMAIL = "e2e@example.com";

/** Where the Firebase Web SDK keeps a persisted session (IndexedDB persistence). */
const FIREBASE_DB = "firebaseLocalStorageDb";
const FIREBASE_STORE = "firebaseLocalStorage";
const SEEDED_FLAG = "e2e-session-seeded";

const base64Url = (value: object | string): string =>
  Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");

/** An unsigned ID token: the SDK only decodes its payload (for the `admin` claim), never verifies it. */
function fakeIdToken(admin: boolean): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = {
    iss: `https://securetoken.google.com/${firebaseConfig.projectId}`,
    aud: firebaseConfig.projectId,
    sub: E2E_UID,
    user_id: E2E_UID,
    auth_time: issuedAt,
    iat: issuedAt,
    exp: issuedAt + 24 * 3600,
    email: E2E_EMAIL,
    admin,
    firebase: { sign_in_provider: "google.com" },
  };
  return `${base64Url({ alg: "none", typ: "JWT" })}.${base64Url(payload)}.${base64Url("e2e")}`;
}

/**
 * Signs the page in through the REAL Firebase session-restore path, so `AuthService.user()` is a real
 * `User`, `idToken()` returns a token and every mutation carries `firebase-auth-key`. The mock
 * GraphQL server rejects a mutation without that header (e2e/mock-graphql.server.mjs), so a spec
 * cannot pass while the token path is broken.
 *
 * Mechanism: before the app boots, a persisted Firebase user is written to the SDK's own IndexedDB
 * store, with an unexpired fake ID token (so no refresh call is made) carrying the `admin` claim; the
 * one request the SDK then makes to validate the session (`accounts:lookup`) is answered locally.
 * The seed is written once per tab (a flag in sessionStorage), so a spec that logs out is not signed
 * back in by its next navigation.
 *
 * Resolves to the ID token the app will send, for specs that assert the header.
 */
export async function loginAs(page: Page, user: { admin?: boolean } = {}): Promise<string> {
  const token = fakeIdToken(user.admin === true);
  const persisted = {
    uid: E2E_UID,
    email: E2E_EMAIL,
    emailVerified: true,
    displayName: E2E_DISPLAY_NAME,
    isAnonymous: false,
    photoURL: null,
    providerData: [],
    stsTokenManager: {
      refreshToken: "e2e-refresh-token",
      accessToken: token,
      expirationTime: Date.now() + 24 * 3600 * 1000,
    },
    createdAt: String(Date.now()),
    lastLoginAt: String(Date.now()),
    apiKey: firebaseConfig.apiKey,
    appName: "[DEFAULT]",
  };

  await page.route("https://identitytoolkit.googleapis.com/**", (route) =>
    route.fulfill({
      json: {
        users: [
          {
            localId: E2E_UID,
            email: E2E_EMAIL,
            emailVerified: true,
            displayName: E2E_DISPLAY_NAME,
            providerUserInfo: [],
            createdAt: persisted.createdAt,
            lastLoginAt: persisted.lastLoginAt,
          },
        ],
      },
    }),
  );

  await page.addInitScript(
    ({ db, store, flag, key, record }) => {
      if (sessionStorage.getItem(flag)) {
        return;
      }
      sessionStorage.setItem(flag, "1");
      const open = indexedDB.open(db, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(store, { keyPath: "fbase_key" });
      open.onsuccess = () => {
        const tx = open.result.transaction(store, "readwrite");
        tx.objectStore(store).put({ fbase_key: key, value: record });
        tx.oncomplete = () => open.result.close();
      };
    },
    {
      db: FIREBASE_DB,
      store: FIREBASE_STORE,
      flag: SEEDED_FLAG,
      key: `firebase:authUser:${firebaseConfig.apiKey}:[DEFAULT]`,
      record: persisted,
    },
  );
  return token;
}
