import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

/**
 * Placeholder for extractIncidentData function
 *
 * This function will be implemented in Task 2.5 (Wave 2) with:
 * - Cheerio page content fetching
 * - Gemini 2.5 Pro AI extraction
 * - Firestore rate limiting (20 req/hour/user)
 * - Strategy pattern for easy Puppeteer swap
 */
export const extractIncidentData = functions.https.onCall(async (data, context) => {
  // TODO: Implement in Task 2.5
  // Expected input: { url: string, requestId: string }
  // Expected output: { ok: boolean, data?: object, error?: string }

  return {
    ok: false,
    error: "Not yet implemented - will be completed in Wave 2 Task 2.5",
  };
});
