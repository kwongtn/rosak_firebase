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

function buildSummarizePrompt(chronologies: unknown[]): string {
  const entries = chronologies
    .map((entry) => {
      if (typeof entry !== "object" || entry === null) {
        return "";
      }
      const record = Object.assign({}, entry) as Record<string, unknown>;
      const datetime = asStringOrNull(record["datetime"]);
      const content = asStringOrNull(record["content"]);
      if (!content) {
        return "";
      }
      return `${datetime ? `[${datetime}] ` : ""}${content}`;
    })
    .filter(Boolean)
    .join("\n");

  return `
You are summarizing a public transportation incident from a sequence of
chronology entries provided by a community member.

Chronology entries:
${entries || "(none)"}

Return a JSON object with exactly these fields:
{
  "title": "Short, punchy incident title (max ~60 chars)",
  "brief": "One or two sentence plain-language summary of what happened",
  "details": "Longer markdown-capable description covering the full sequence of events"
}

The title and brief must be in the same language as the chronology entries.
If there is no usable content, still return the object with empty strings.
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

function asChronologyList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function parseSummary(raw: string): { title: string; brief: string; details: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new functions.https.HttpsError("internal", "AI summarization returned invalid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new functions.https.HttpsError(
      "internal",
      "AI summarization returned an unexpected shape",
    );
  }
  const record: Record<string, unknown> = {};
  Object.assign(record, parsed);
  return {
    title: asStringOrNull(record["title"]) ?? "",
    brief: asStringOrNull(record["brief"]) ?? "",
    details: asStringOrNull(record["details"]) ?? "",
  };
}

export const summarizeIncident = functions
  .region("asia-southeast1")
  .runWith({ timeoutSeconds: 30, memory: "256MB" })
  .https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    if (!uid) {
      throw new functions.https.HttpsError("unauthenticated", "Must be logged in");
    }

    const payload: Record<string, unknown> =
      typeof data === "object" && data !== null ? Object.assign({}, data) : {};
    const chronologies = asChronologyList(payload["chronologies"]);

    if (!process.env.GEMINI_API_KEY) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "GEMINI_API_KEY is not configured",
      );
    }

    const hourKey = new Date().toISOString().slice(0, 13);
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

    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    try {
      const result = await model.generateContent(buildSummarizePrompt(chronologies));
      return parseSummary(result.response.text());
    } catch (error: unknown) {
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      functions.logger.error("Gemini summarization failed", {
        model: GEMINI_MODEL,
        error: toErrorMessage(error),
      });
      throw new functions.https.HttpsError("internal", "AI summarization failed");
    }
  });
