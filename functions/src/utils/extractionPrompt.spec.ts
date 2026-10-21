import { describe, expect, it } from "vitest";
import { buildExtractionPrompt, formatKlDateTime, KL_TIME_ZONE } from "./extractionPrompt";
import { INDICATORS, SEVERITIES } from "./extractionParser";

describe("formatKlDateTime", () => {
  it("renders the Kuala Lumpur wall clock with the +08:00 offset", () => {
    expect(formatKlDateTime(new Date("2026-10-22T06:30:00Z"))).toBe("2026-10-22T14:30:00+08:00");
  });

  it("is already on the next KL day while UTC is still on the previous one", () => {
    expect(formatKlDateTime(new Date("2026-10-21T17:00:00Z"))).toBe("2026-10-22T01:00:00+08:00");
  });

  it("keeps whole seconds and drops milliseconds", () => {
    expect(formatKlDateTime(new Date("2026-01-05T00:00:09.987Z"))).toBe(
      "2026-01-05T08:00:09+08:00",
    );
  });
});

describe("buildExtractionPrompt", () => {
  const now = new Date("2026-10-22T06:30:00Z");
  const prompt = buildExtractionPrompt("https://x.com/a/1", "Signal fault at KL Sentral", now);

  it("gives the model the current Kuala Lumpur date-time and the zone name", () => {
    expect(prompt).toContain("2026-10-22T14:30:00+08:00");
    expect(prompt).toContain(KL_TIME_ZONE);
    expect(KL_TIME_ZONE).toBe("Asia/Kuala_Lumpur");
  });

  it("tells the model to resolve relative phrases and year-less dates against it", () => {
    expect(prompt).toContain("yesterday 3pm");
    expect(prompt).toContain("without a year");
  });

  it("carries the source URL and the page content", () => {
    expect(prompt).toContain("Source URL: https://x.com/a/1");
    expect(prompt).toContain("Signal fault at KL Sentral");
    expect(prompt).toContain('"source_url": "https://x.com/a/1"');
  });

  it("still requests every field of the response schema", () => {
    for (const field of [
      "title",
      "datetime",
      "content",
      "source_url",
      "indicator",
      "severity",
      "affected_lines",
      "affected_stations",
    ]) {
      expect(prompt).toContain(`"${field}":`);
    }
  });

  it("lists the indicator and severity vocabularies the parser accepts", () => {
    expect(prompt).toContain(INDICATORS.join("|"));
    expect(prompt).toContain(SEVERITIES.join("|"));
  });
});
