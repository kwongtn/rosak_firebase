/* ---------------------------------------------------------------------- *
 * requestVerificationCode — mints a short-lived 6-digit code the user reads
 * off this panel and sends to the Telegram bot (`/verify <code>`) to link
 * their account, ported from the old app's `verification-code-card`. No
 * variables; auth is carried entirely via the `firebase-auth-key` header.
 *
 * The 60s countdown shown here is purely a client-side display convention
 * inherited from the old app — the backend enforces no per-request cooldown
 * (a code just keeps working, via a background sweep every ~10 minutes,
 * until either it's consumed or that sweep deletes it), so nothing here
 * needs to coordinate with the server about timing.
 * ---------------------------------------------------------------------- */

export const REQUEST_VERIFICATION_CODE_MUTATION = /* GraphQL */ `
  mutation RequestVerificationCode {
    requestVerificationCode {
      code
    }
  }
`;

export interface RequestVerificationCodeData {
  requestVerificationCode: {
    code: number;
  };
}
