import { describe, expect, it } from "vitest";

import {
  blankLineStatusDraft,
  isBlankLineStatusDraft,
  lineStatusDraftKey,
  parseLineStatusDraft,
  sameLineStatusDraft,
  serializeLineStatusDraft,
  type LineStatusDraft,
} from "./line-status-draft.util";

const DRAFT: LineStatusDraft = {
  status: "DELAYED",
  delayMinutes: "12",
  notes: "Two trains stuck at Angkasapuri",
  stationIds: ["s1", "s2"],
};

describe("line status draft (de)serialisers", () => {
  it("round-trips every field the sheet holds", () => {
    expect(parseLineStatusDraft(serializeLineStatusDraft(DRAFT))).toEqual(DRAFT);
  });

  it("keys a draft by its line", () => {
    expect(lineStatusDraftKey("line-1")).toBe("rosak:draft:line-status:v1:line-1");
    expect(lineStatusDraftKey("line-1")).not.toBe(lineStatusDraftKey("line-2"));
  });

  it.each([
    ["nothing stored", null],
    ["an empty string", ""],
    ["text that is not JSON", "{not json"],
    ["a JSON array", '["DELAYED"]'],
    ["a JSON number", "7"],
    ["JSON null", "null"],
    ["an empty object", "{}"],
  ])("returns null, without throwing, for %s", (_label, raw) => {
    expect(parseLineStatusDraft(raw)).toBeNull();
  });

  it("returns null for a stored draft that is blank", () => {
    expect(parseLineStatusDraft(serializeLineStatusDraft(blankLineStatusDraft()))).toBeNull();
  });

  it("drops an unknown status and unreadable fields, keeping the rest", () => {
    const draft = parseLineStatusDraft(
      JSON.stringify({
        status: "ON_FIRE",
        delayMinutes: 12,
        notes: "Still here",
        stationIds: ["s1", 2, "", null, "s3"],
      }),
    );

    expect(draft).toEqual({
      status: null,
      delayMinutes: "",
      notes: "Still here",
      stationIds: ["s1", "s3"],
    });
  });

  it("tells a blank draft from one with any single field", () => {
    expect(isBlankLineStatusDraft(blankLineStatusDraft())).toBe(true);
    expect(isBlankLineStatusDraft({ ...blankLineStatusDraft(), status: "NORMAL" })).toBe(false);
    expect(isBlankLineStatusDraft({ ...blankLineStatusDraft(), delayMinutes: "0" })).toBe(false);
    expect(isBlankLineStatusDraft({ ...blankLineStatusDraft(), notes: " " })).toBe(false);
    expect(isBlankLineStatusDraft({ ...blankLineStatusDraft(), stationIds: ["s1"] })).toBe(false);
  });

  it("compares drafts field by field, station order included", () => {
    expect(sameLineStatusDraft(DRAFT, { ...DRAFT, stationIds: ["s1", "s2"] })).toBe(true);
    expect(sameLineStatusDraft(DRAFT, { ...DRAFT, stationIds: ["s2", "s1"] })).toBe(false);
    expect(sameLineStatusDraft(DRAFT, { ...DRAFT, notes: "other" })).toBe(false);
    expect(sameLineStatusDraft(DRAFT, { ...DRAFT, status: null })).toBe(false);
  });
});
