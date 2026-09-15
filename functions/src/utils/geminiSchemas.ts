/**
 * Explicit JSON Schemas for Gemini structured outputs.
 *
 * The spec mandates `response_mime_type="application/json"` with an explicit
 * JSON Schema for both the extract and summarize calls. These schemas encode
 * the canonical shapes the response parsers expect (extractionParser.ts and
 * parseSummary in api.ts) — field names, types, enums and nullability must
 * stay in lockstep with those parsers.
 */

import { SchemaType, type ResponseSchema } from "@google/generative-ai";
import { INDICATORS, SEVERITIES } from "./extractionParser";

/** Canonical shape for the extract endpoint — mirrors parseExtraction(). */
export const EXTRACT_RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    title: { type: SchemaType.STRING, nullable: true },
    datetime: { type: SchemaType.STRING, nullable: true },
    content: { type: SchemaType.STRING, nullable: true },
    source_url: { type: SchemaType.STRING },
    indicator: { type: SchemaType.STRING, enum: [...INDICATORS] },
    severity: { type: SchemaType.STRING, enum: [...SEVERITIES], nullable: true },
    affected_lines: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    affected_stations: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
  },
  required: [
    "title",
    "datetime",
    "content",
    "source_url",
    "indicator",
    "severity",
    "affected_lines",
    "affected_stations",
  ],
};

/** Canonical shape for the summarize endpoint — mirrors parseSummary(). */
export const SUMMARIZE_RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    title: { type: SchemaType.STRING },
    brief: { type: SchemaType.STRING },
    details: { type: SchemaType.STRING },
  },
  required: ["title", "brief", "details"],
};
