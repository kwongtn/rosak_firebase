import { describe, expect, it } from "vitest";
import { formatHourKey } from "./hourKey";

describe("formatHourKey", () => {
  it("formats a UTC date as YYYY-MM-DD-HH", () => {
    expect(formatHourKey(new Date("2026-09-03T14:30:00Z"))).toBe("2026-09-03-14");
  });

  it("keeps month, day and hour zero-padded", () => {
    expect(formatHourKey(new Date("2026-01-05T09:05:00Z"))).toBe("2026-01-05-09");
  });

  it("buckets by hour — minutes and seconds do not affect the key", () => {
    expect(formatHourKey(new Date("2026-09-03T14:00:00Z"))).toBe("2026-09-03-14");
    expect(formatHourKey(new Date("2026-09-03T14:59:59Z"))).toBe("2026-09-03-14");
  });

  it("rolls over at midnight UTC", () => {
    expect(formatHourKey(new Date("2026-09-03T23:59:59Z"))).toBe("2026-09-03-23");
    expect(formatHourKey(new Date("2026-09-04T00:00:00Z"))).toBe("2026-09-04-00");
  });
});
