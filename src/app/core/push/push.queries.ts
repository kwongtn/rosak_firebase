import type { PushLine } from "./push-storage";

/**
 * The backend's web push contract (`rosak_backend` incident app, `PushSubscription`). All three need
 * the signed-in caller's `firebase-auth-key`. `registerPushToken` upserts by token and REPLACES the
 * lines, so every call sends the full set; `unregisterPushToken` deletes the caller's own row and is
 * `ok` for an unknown token too.
 */
export const REGISTER_PUSH_TOKEN_MUTATION = `
  mutation RegisterPushToken($token: String!, $lineIds: [ID!]!) {
    registerPushToken(token: $token, lineIds: $lineIds) {
      ok
    }
  }
`;

export const UNREGISTER_PUSH_TOKEN_MUTATION = `
  mutation UnregisterPushToken($token: String!) {
    unregisterPushToken(token: $token) {
      ok
    }
  }
`;

/** The caller's own subscription for this browser's token; `null` when the token is unknown to the
 * backend or registered by another account. */
export const PUSH_SUBSCRIPTION_QUERY = `
  query PushSubscription($token: String!) {
    pushSubscription(token: $token) {
      token
      lines {
        id
        code
      }
    }
  }
`;

export interface RegisterPushTokenVars {
  token: string;
  lineIds: string[];
}

export interface RegisterPushTokenData {
  registerPushToken: { ok: boolean };
}

export interface UnregisterPushTokenVars {
  token: string;
}

export interface UnregisterPushTokenData {
  unregisterPushToken: { ok: boolean };
}

export interface PushSubscriptionVars {
  token: string;
}

export interface PushSubscriptionData {
  pushSubscription: { token: string; lines: PushLine[] } | null;
}
