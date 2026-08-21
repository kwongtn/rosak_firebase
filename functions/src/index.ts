import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getPageContentFetcher, type FetcherStrategy } from "./utils/pageContentFetcher";
import { asStringOrNull, parseExtraction } from "./utils/extractionParser";

admin.initializeApp();

const db = admin.firestore();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

/** Hourly per-user extraction quota — generous for manual submissions. */
const RATE_LIMIT_PER_HOUR = 20;

/** Extraction model; override with GEMINI_MODEL without a code change. */
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-pro";

function buildPrompt(url: string, content: string): string {
  return `
You are extracting incident data from a public transportation news article.

Source URL: ${url}
Content:
${content}

Extract the following information in JSON format:
{
  "title": "Brief incident title",
  "datetime": "ISO 8601 timestamp when incident occurred (null if not mentioned)",
  "content": "Detailed description of what happened",
  "source_url": "${url}",
  "indicator": "delay|disruption|accident|maintenance|other",
  "severity": "minor|moderate|major|critical",
  "affected_lines": ["line names if mentioned"],
  "affected_stations": ["station names if mentioned"]
}

If information is not available, use null.
`;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const extractIncidentData = functions
  .region("asia-southeast1")
  .runWith({ timeoutSeconds: 20, memory: "256MB" })
  .https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    if (!uid) {
      throw new functions.https.HttpsError("unauthenticated", "Must be logged in");
    }

    const payload: Record<string, unknown> =
      typeof data === "object" && data !== null ? Object.assign({}, data) : {};
    const url = asStringOrNull(payload["url"]);
    const requestId = asStringOrNull(payload["requestId"]);

    if (!url || !requestId) {
      throw new functions.https.HttpsError("invalid-argument", "url and requestId required");
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "url must be an absolute http(s) URL",
      );
    }
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      throw new functions.https.HttpsError("invalid-argument", "url must use http or https");
    }

    if (!process.env.GEMINI_API_KEY) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "GEMINI_API_KEY is not configured",
      );
    }

    // Rate limiting: 20 requests/hour per user (UTC hour bucket).
    const hourKey = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
    const rateLimitDoc = db.collection("rate_limits").doc(`${uid}_${hourKey}`);

    const snapshot = await rateLimitDoc.get();
    const count = snapshot.exists ? Number(snapshot.data()?.["count"] ?? 0) : 0;

    if (count >= RATE_LIMIT_PER_HOUR) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        `Rate limit: ${RATE_LIMIT_PER_HOUR} requests per hour`,
      );
    }

    await rateLimitDoc.set(
      { count: admin.firestore.FieldValue.increment(1), uid, hour: hourKey },
      { merge: true },
    );

    // Fetch page content using the strategy pattern.
    const strategy: FetcherStrategy =
      process.env.FETCHER_STRATEGY === "puppeteer" ? "puppeteer" : "cheerio";
    const fetcher = getPageContentFetcher(strategy);

    let pageContent: string;
    try {
      pageContent = await fetcher.fetch(url);
    } catch (error: unknown) {
      functions.logger.error("Page fetch failed", { url, strategy, error: toErrorMessage(error) });
      throw new functions.https.HttpsError(
        "unavailable",
        `Cannot fetch URL: ${toErrorMessage(error)}`,
      );
    }

    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    try {
      const result = await model.generateContent(buildPrompt(url, pageContent));
      return {
        requestId,
        data: parseExtraction(result.response.text(), url),
      };
    } catch (error: unknown) {
      functions.logger.error("Gemini extraction failed", {
        url,
        model: GEMINI_MODEL,
        error: toErrorMessage(error),
      });
      throw new functions.https.HttpsError("internal", "AI extraction failed");
    }
  });
