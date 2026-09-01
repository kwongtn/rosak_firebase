import * as functions from "firebase-functions";
import {
  api,
  rateLimit,
  handleExtract,
  handleSummarize,
  ValidationError,
  RateLimitError,
  ConfigError,
  UnavailableError,
} from "./api";

export { api };

function mapCallableError(error: unknown): functions.https.HttpsError {
  if (error instanceof ValidationError) {
    return new functions.https.HttpsError("invalid-argument", error.message);
  }
  if (error instanceof RateLimitError) {
    return new functions.https.HttpsError("resource-exhausted", error.message);
  }
  if (error instanceof ConfigError) {
    return new functions.https.HttpsError("failed-precondition", error.message);
  }
  if (error instanceof UnavailableError) {
    return new functions.https.HttpsError("unavailable", error.message);
  }
  const message = error instanceof Error ? error.message : "Unknown error";
  return new functions.https.HttpsError("internal", message);
}

function parsePayload(data: unknown): Record<string, unknown> {
  if (typeof data === "object" && data !== null) {
    return Object.assign({}, data) as Record<string, unknown>;
  }
  return {};
}

export const extractIncidentData = functions
  .region("asia-southeast1")
  .runWith({ timeoutSeconds: 20, memory: "256MB" })
  .https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    if (!uid) {
      throw new functions.https.HttpsError("unauthenticated", "Must be logged in");
    }

    try {
      await rateLimit(uid, "main");
      return await handleExtract(parsePayload(data));
    } catch (error: unknown) {
      throw mapCallableError(error);
    }
  });

export const summarizeIncident = functions
  .region("asia-southeast1")
  .runWith({ timeoutSeconds: 30, memory: "256MB" })
  .https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    if (!uid) {
      throw new functions.https.HttpsError("unauthenticated", "Must be logged in");
    }

    try {
      await rateLimit(uid, "main");
      return await handleSummarize(parsePayload(data));
    } catch (error: unknown) {
      throw mapCallableError(error);
    }
  });
