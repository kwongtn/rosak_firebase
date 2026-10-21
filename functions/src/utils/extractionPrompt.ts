/**
 * The Gemini prompt for the extract endpoint. Kept free of Firebase imports (api.ts initialises
 * firebase-admin at import time) so it can be unit tested on its own.
 *
 * The field list and enums must stay in lockstep with extractionParser.ts and geminiSchemas.ts.
 */

export const KL_TIME_ZONE = "Asia/Kuala_Lumpur";

/** Malaysia has no DST, so Asia/Kuala_Lumpur is a fixed UTC+8. */
const KL_OFFSET_MS = 8 * 3_600_000;

/** An instant on the Kuala Lumpur wall clock as `YYYY-MM-DDTHH:mm:ss+08:00`. */
export function formatKlDateTime(date: Date): string {
  return `${new Date(date.getTime() + KL_OFFSET_MS).toISOString().slice(0, 19)}+08:00`;
}

/**
 * `now` is a parameter, not read here, so the prompt is deterministic under test. The model
 * has no clock of its own: without the current date it guesses the year of a "3 Oct" and
 * cannot resolve "yesterday 3pm".
 */
export function buildExtractionPrompt(url: string, content: string, now: Date): string {
  return `
You are extracting incident data from a public transportation news article.

Source URL: ${url}
Current date and time: ${formatKlDateTime(now)} (time zone: ${KL_TIME_ZONE}, UTC+8)
Times in the article are Malaysia time unless it says otherwise. Resolve relative phrases such as
"yesterday 3pm" and dates written without a year against the current date and time above.
Content:
${content}

Extract the following information in JSON format:
{
  "title": "Brief incident title (max 60 characters)",
  "datetime": "ISO 8601 timestamp with the +08:00 offset when incident occurred (null if not mentioned)",
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
