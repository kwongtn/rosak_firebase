import { describe, expect, it } from "vitest";
import { SchemaType } from "@google/generative-ai";
import { EXTRACT_RESPONSE_SCHEMA, SUMMARIZE_RESPONSE_SCHEMA } from "./geminiSchemas";
import { INDICATORS, SEVERITIES } from "./extractionParser";

describe("EXTRACT_RESPONSE_SCHEMA", () => {
  it("is an object schema with exactly the parser's fields", () => {
    expect(EXTRACT_RESPONSE_SCHEMA.type).toBe(SchemaType.OBJECT);
    expect(Object.keys(EXTRACT_RESPONSE_SCHEMA.properties ?? {})).toEqual([
      "title",
      "datetime",
      "content",
      "source_url",
      "indicator",
      "severity",
      "affected_lines",
      "affected_stations",
    ]);
  });

  it("declares every field required", () => {
    expect(EXTRACT_RESPONSE_SCHEMA.required).toEqual([
      "title",
      "datetime",
      "content",
      "source_url",
      "indicator",
      "severity",
      "affected_lines",
      "affected_stations",
    ]);
  });

  it("encodes the parser enums for indicator and severity", () => {
    const properties = EXTRACT_RESPONSE_SCHEMA.properties ?? {};
    expect(properties["indicator"]?.enum).toEqual([...INDICATORS]);
    expect(properties["severity"]?.enum).toEqual([...SEVERITIES]);
  });

  it("marks nullable the fields the parser accepts as null", () => {
    const properties = EXTRACT_RESPONSE_SCHEMA.properties ?? {};
    expect(properties["title"]?.nullable).toBe(true);
    expect(properties["datetime"]?.nullable).toBe(true);
    expect(properties["content"]?.nullable).toBe(true);
    expect(properties["severity"]?.nullable).toBe(true);
    expect(properties["source_url"]?.nullable).toBeUndefined();
  });

  it("types array fields as string arrays", () => {
    const properties = EXTRACT_RESPONSE_SCHEMA.properties ?? {};
    expect(properties["affected_lines"]?.type).toBe(SchemaType.ARRAY);
    expect(properties["affected_lines"]?.items?.type).toBe(SchemaType.STRING);
    expect(properties["affected_stations"]?.type).toBe(SchemaType.ARRAY);
    expect(properties["affected_stations"]?.items?.type).toBe(SchemaType.STRING);
  });
});

describe("SUMMARIZE_RESPONSE_SCHEMA", () => {
  it("is an object schema with exactly title, brief, details", () => {
    expect(SUMMARIZE_RESPONSE_SCHEMA.type).toBe(SchemaType.OBJECT);
    expect(Object.keys(SUMMARIZE_RESPONSE_SCHEMA.properties ?? {})).toEqual([
      "title",
      "brief",
      "details",
    ]);
    expect(SUMMARIZE_RESPONSE_SCHEMA.required).toEqual(["title", "brief", "details"]);
  });

  it("types all three fields as non-nullable strings", () => {
    const properties = SUMMARIZE_RESPONSE_SCHEMA.properties ?? {};
    for (const key of ["title", "brief", "details"]) {
      expect(properties[key]?.type).toBe(SchemaType.STRING);
      expect(properties[key]?.nullable).toBeUndefined();
    }
  });
});
