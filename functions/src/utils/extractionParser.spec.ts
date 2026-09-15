import { describe, expect, it } from "vitest";
import { parseExtraction, ExtractionParseError } from "./extractionParser";

const URL = "https://example.com/news/derailment";

describe("parseExtraction", () => {
  it("returns typed incident fields when given a complete valid JSON reply", () => {
    const raw = JSON.stringify({
      title: "LRT Kelana Jaya line delay",
      datetime: "2026-08-21T08:30:00+08:00",
      content: "Signal failure caused a 20-minute delay.",
      source_url: URL,
      indicator: "delay",
      severity: "moderate",
      affected_lines: ["Kelana Jaya Line"],
      affected_stations: ["KL Sentral"],
    });

    expect(parseExtraction(raw, URL)).toEqual({
      title: "LRT Kelana Jaya line delay",
      datetime: "2026-08-21T08:30:00+08:00",
      content: "Signal failure caused a 20-minute delay.",
      source_url: URL,
      indicator: "delay",
      severity: "moderate",
      affected_lines: ["Kelana Jaya Line"],
      affected_stations: ["KL Sentral"],
    });
  });

  it("throws ExtractionParseError when the reply is not valid JSON", () => {
    expect(() => parseExtraction("not json at all {", URL)).toThrow(ExtractionParseError);
  });

  it("throws ExtractionParseError when the reply is a JSON array instead of an object", () => {
    expect(() => parseExtraction('["title"]', URL)).toThrow(ExtractionParseError);
  });

  it("normalizes unknown enum values instead of failing (indicator -> other, severity -> null)", () => {
    const raw = JSON.stringify({
      title: "t",
      indicator: "catastrophe",
      severity: "severe",
    });

    const parsed = parseExtraction(raw, URL);

    expect(parsed.indicator).toBe("other");
    expect(parsed.severity).toBeNull();
  });

  it("falls back to null for missing or empty fields and keeps the input url as source_url", () => {
    const parsed = parseExtraction(JSON.stringify({ title: "" }), URL);

    expect(parsed.title).toBeNull();
    expect(parsed.datetime).toBeNull();
    expect(parsed.content).toBeNull();
    expect(parsed.source_url).toBe(URL);
    expect(parsed.affected_lines).toEqual([]);
    expect(parsed.affected_stations).toEqual([]);
  });

  it("filters non-string entries out of array fields", () => {
    const raw = JSON.stringify({
      affected_lines: ["Ampang Line", 42, null],
      affected_stations: ["Masjid Jamek"],
    });

    const parsed = parseExtraction(raw, URL);

    expect(parsed.affected_lines).toEqual(["Ampang Line"]);
    expect(parsed.affected_stations).toEqual(["Masjid Jamek"]);
  });
});
