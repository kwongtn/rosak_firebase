import { describe, expect, it } from "vitest";

import { emptyChronology } from "./chronology-list.util";
import { applyExtractionToChronology, isoToDateTimeLocal } from "./extract-data.util";

describe("isoToDateTimeLocal", () => {
  it("converts an ISO datetime to the datetime-local input format in local time", () => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const local = new Date("2026-08-22T09:30:00Z");
    const expected = `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(
      local.getDate(),
    )}T${pad(local.getHours())}:${pad(local.getMinutes())}`;
    expect(isoToDateTimeLocal("2026-08-22T09:30:00Z")).toBe(expected);
  });

  it("returns empty string for null, empty, or invalid input", () => {
    expect(isoToDateTimeLocal(null)).toBe("");
    expect(isoToDateTimeLocal(undefined)).toBe("");
    expect(isoToDateTimeLocal("")).toBe("");
    expect(isoToDateTimeLocal("not-a-date")).toBe("");
  });
});

describe("applyExtractionToChronology", () => {
  const data = {
    title: "LRT delay",
    datetime: "2026-08-22T09:30:00Z",
    content: "Signal failure at KL Sentral.",
    source_url: "https://example.com/post",
    indicator: "disruption" as const,
    severity: "major" as const,
    affected_lines: [],
    affected_stations: [],
  };

  it("overwrites datetime and content but preserves the user's source URL and indicator", () => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const local = new Date(data.datetime);
    const expectedLocal = `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(
      local.getDate(),
    )}T${pad(local.getHours())}:${pad(local.getMinutes())}`;
    const draft = {
      ...emptyChronology(0),
      sourceUrl: "https://user.example/1",
      indicator: "RED" as const,
    };
    const result = applyExtractionToChronology(draft, data);

    expect(result.datetime).toBe(expectedLocal);
    expect(result.content).toBe("Signal failure at KL Sentral.");
    expect(result.sourceUrl).toBe("https://user.example/1");
    expect(result.indicator).toBe("RED");
  });

  it("keeps the draft's existing values when extraction returns nulls", () => {
    const draft = { ...emptyChronology(1), datetime: "2026-08-01T08:00", content: "Existing" };
    const result = applyExtractionToChronology(draft, { ...data, datetime: null, content: null });

    expect(result.datetime).toBe("2026-08-01T08:00");
    expect(result.content).toBe("Existing");
  });

  it("is a pure projection — the original draft is untouched", () => {
    const draft = emptyChronology(2);
    applyExtractionToChronology(draft, data);
    expect(draft.datetime).toBe("");
    expect(draft.content).toBe("");
  });
});
