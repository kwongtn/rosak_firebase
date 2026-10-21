import { afterEach, describe, expect, it, vi } from "vitest";

import { klDateKey } from "./kl-date";

describe("klDateKey", () => {
  afterEach(() => vi.useRealTimers());

  it("rolls to the next Kuala Lumpur day while UTC is still on the previous one", () => {
    // 03:30 MYT on the 21st is still the 20th in UTC.
    expect(klDateKey(Date.parse("2026-10-20T19:30:00Z"))).toBe("2026-10-21");
  });

  it("flips exactly at 00:00 MYT (16:00 UTC)", () => {
    expect(klDateKey(Date.parse("2026-10-20T15:59:59Z"))).toBe("2026-10-20");
    expect(klDateKey(Date.parse("2026-10-20T16:00:00Z"))).toBe("2026-10-21");
  });

  it("carries across month and year boundaries", () => {
    expect(klDateKey(Date.parse("2026-12-31T16:00:00Z"))).toBe("2027-01-01");
    expect(klDateKey(Date.parse("2026-02-28T16:00:00Z"))).toBe("2026-03-01");
    expect(klDateKey(Date.parse("2028-02-28T16:00:00Z"))).toBe("2028-02-29");
  });

  it("defaults to the current instant", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-20T19:30:00Z"));
    expect(klDateKey()).toBe("2026-10-21");
  });
});
