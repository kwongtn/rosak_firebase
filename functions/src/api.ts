/**
 * Express onRequest API for Firebase Functions — prefix-aware routing.
 *
 * Routes (all POST):
 *   /staging/v1/extract   -> extract incident data (staging partition)
 *   /main/v1/extract      -> extract incident data (main partition)
 *   /prod/v1/extract      -> alias for /main/v1/extract
 *   /staging/v1/summarize -> summarize incident (staging partition)
 *   /main/v1/summarize    -> summarize incident (main partition)
 *   /prod/v1/summarize    -> alias for /main/v1/summarize
 *
 * Auth:  Bearer token verified via admin.auth().verifyIdToken.
 * Rate limit: 20 requests/hour per user, partitioned by env.
 *   - staging -> rate_limits_staging collection
 *   - main/prod -> rate_limits collection
 *
 * The shared handlers (verifyAuth, rateLimit, handleExtract, handleSummarize)
 * are exported so the legacy Gen1 callables in index.ts can reuse them.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import express from "express";
import cors from "cors";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getPageContentFetcher, type FetcherStrategy } from "./utils/pageContentFetcher";
import { asStringOrNull, parseExtraction, type ExtractedIncident } from "./utils/extractionParser";
import { EXTRACT_RESPONSE_SCHEMA, SUMMARIZE_RESPONSE_SCHEMA } from "./utils/geminiSchemas";
import { formatHourKey } from "./utils/hourKey";

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class AuthError extends ApiError {
  constructor(message: string) {
    super(401, message);
  }
}

export class ValidationError extends ApiError {
  constructor(message: string) {
    super(400, message);
  }
}

export class RateLimitError extends ApiError {
  constructor(message: string) {
    super(429, message);
  }
}

export class ConfigError extends ApiError {
  constructor(message: string) {
    super(503, message);
  }
}

export class UnavailableError extends ApiError {
  constructor(message: string) {
    super(502, message);
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RATE_LIMIT_PER_HOUR = 20;
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

const db = admin.firestore();

let genAIInstance: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (!genAIInstance) {
    genAIInstance = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");
  }
  return genAIInstance;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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

function asChronologyList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function parseSummary(raw: string): { title: string; brief: string; details: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("AI summarization returned invalid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("AI summarization returned an unexpected shape");
  }
  const record: Record<string, unknown> = {};
  Object.assign(record, parsed);
  return {
    title: asStringOrNull(record["title"]) ?? "",
    brief: asStringOrNull(record["brief"]) ?? "",
    details: asStringOrNull(record["details"]) ?? "",
  };
}

// ---------------------------------------------------------------------------
// Shared handlers (used by both Express routes and legacy callables)
// ---------------------------------------------------------------------------

export async function verifyAuth(req: express.Request): Promise<string> {
  const header = req.headers.authorization ?? "";
  const match = header.match(/^Bearer\s+([\s\S]+)$/i);
  if (!match?.[1]) {
    throw new AuthError("Missing or malformed Authorization header");
  }
  try {
    const decoded = await admin.auth().verifyIdToken(match[1]);
    return decoded.uid;
  } catch {
    throw new AuthError("Invalid or expired token");
  }
}

export async function rateLimit(uid: string, env: "staging" | "main"): Promise<void> {
  const hourKey = formatHourKey(new Date());
  const collection = env === "staging" ? "rate_limits_staging" : "rate_limits";
  const rateLimitDoc = db.collection(collection).doc(`${uid}_${hourKey}`);

  const snapshot = await rateLimitDoc.get();
  const count = snapshot.exists ? Number(snapshot.data()?.["count"] ?? 0) : 0;

  if (count >= RATE_LIMIT_PER_HOUR) {
    throw new RateLimitError(`Rate limit: ${RATE_LIMIT_PER_HOUR} requests per hour`);
  }

  await rateLimitDoc.set(
    { count: admin.firestore.FieldValue.increment(1), uid, hour: hourKey },
    { merge: true },
  );
}

function parseRequestBody(req: express.Request): Record<string, unknown> {
  const body = req.body;
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ValidationError("Request body must be a JSON object");
  }
  return Object.assign({}, body);
}

export async function handleExtract(body: Record<string, unknown>): Promise<{
  requestId: string;
  data: ExtractedIncident;
}> {
  const url = asStringOrNull(body["url"]);
  const requestId = asStringOrNull(body["requestId"]);

  if (!url || !requestId) {
    throw new ValidationError("url and requestId required");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new ValidationError("url must be an absolute http(s) URL");
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new ValidationError("url must use http or https");
  }

  if (!process.env.GEMINI_API_KEY) {
    throw new ConfigError("GEMINI_API_KEY is not configured");
  }

  const strategy: FetcherStrategy =
    process.env.FETCHER_STRATEGY === "puppeteer" ? "puppeteer" : "cheerio";
  const fetcher = getPageContentFetcher(strategy);

  let pageContent: string;
  try {
    pageContent = await fetcher.fetch(url);
  } catch (error: unknown) {
    functions.logger.error("Page fetch failed", { url, strategy, error: toErrorMessage(error) });
    throw new UnavailableError(`Cannot fetch URL: ${toErrorMessage(error)}`);
  }

  const model = getGenAI().getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: EXTRACT_RESPONSE_SCHEMA,
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
    throw new Error("AI extraction failed");
  }
}

export async function handleSummarize(body: Record<string, unknown>): Promise<{
  title: string;
  brief: string;
  details: string;
}> {
  const chronologies = asChronologyList(body["chronologies"]);

  if (!process.env.GEMINI_API_KEY) {
    throw new ConfigError("GEMINI_API_KEY is not configured");
  }

  const model = getGenAI().getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: SUMMARIZE_RESPONSE_SCHEMA,
    },
  });

  try {
    const result = await model.generateContent(buildSummarizePrompt(chronologies));
    return parseSummary(result.response.text());
  } catch (error: unknown) {
    functions.logger.error("Gemini summarization failed", {
      model: GEMINI_MODEL,
      error: toErrorMessage(error),
    });
    throw new Error("AI summarization failed");
  }
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

function createExtractHandler(env: "staging" | "main") {
  return async (req: express.Request, res: express.Response) => {
    try {
      const uid = await verifyAuth(req);
      await rateLimit(uid, env);
      const body = parseRequestBody(req);
      const result = await handleExtract(body);
      functions.logger.info("Extract success", { env, uid });
      res.json(result);
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        res.status(error.statusCode).json({ error: error.name, message: error.message });
      } else {
        functions.logger.error("Extract failed", { env, error: toErrorMessage(error) });
        res.status(500).json({ error: "internal", message: "Request failed" });
      }
    }
  };
}

function createSummarizeHandler(env: "staging" | "main") {
  return async (req: express.Request, res: express.Response) => {
    try {
      const uid = await verifyAuth(req);
      await rateLimit(uid, env);
      const body = parseRequestBody(req);
      const result = await handleSummarize(body);
      functions.logger.info("Summarize success", { env, uid });
      res.json(result);
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        res.status(error.statusCode).json({ error: error.name, message: error.message });
      } else {
        functions.logger.error("Summarize failed", { env, error: toErrorMessage(error) });
        res.status(500).json({ error: "internal", message: "Request failed" });
      }
    }
  };
}

// Route table
app.post("/staging/v1/extract", createExtractHandler("staging"));
app.post("/main/v1/extract", createExtractHandler("main"));
app.post("/prod/v1/extract", createExtractHandler("main"));
app.post("/staging/v1/summarize", createSummarizeHandler("staging"));
app.post("/main/v1/summarize", createSummarizeHandler("main"));
app.post("/prod/v1/summarize", createSummarizeHandler("main"));

// 404 for unknown paths
app.use((_req: express.Request, res: express.Response) => {
  res.status(404).json({ error: "not-found", message: "Unknown endpoint" });
});

// JSON parse error handler
app.use(
  (error: Error, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (error instanceof SyntaxError && "body" in error) {
      res.status(400).json({ error: "invalid-json", message: "Request body must be valid JSON" });
      return;
    }
    next(error);
  },
);

export const api = functions
  .region("asia-southeast1")
  .runWith({
    timeoutSeconds: 30,
    memory: "256MB",
    secrets: ["GEMINI_API_KEY"],
  })
  .https.onRequest(app);
