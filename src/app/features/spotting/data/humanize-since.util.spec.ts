import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { humanizeSince } from "./humanize-since.util";

const NOW = new Date(2026, 7, 18, 12, 0, 0); // Aug 18, 2026, local noon

/** An ISO timestamp `ms` before NOW — built from the same clock, so it is timezone-independent. */
function ago(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

describe("humanizeSince", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return 'less than a minute ago' for the current time and anything under 60 seconds", () => {
    expect(humanizeSince(ago(0))).toBe("less than a minute ago");
    expect(humanizeSince(ago(59_999))).toBe("less than a minute ago");
  });

  it("should format minutes only with correct singular/plural forms", () => {
    expect(humanizeSince(ago(60_000))).toBe("1 minute ago");
    expect(humanizeSince(ago(3 * 60_000))).toBe("3 minutes ago");
    expect(humanizeSince(ago(59 * 60_000))).toBe("59 minutes ago");
  });

  it("should format hours only with correct singular/plural forms", () => {
    expect(humanizeSince(ago(60 * 60_000))).toBe("1 hour ago");
    expect(humanizeSince(ago(5 * 60 * 60_000))).toBe("5 hours ago");
    expect(humanizeSince(ago(23 * 60 * 60_000 + 59 * 60_000))).toBe("23 hours ago");
    // Same calendar day, but hours old: never "today" on a live feed.
    expect(humanizeSince(new Date(2026, 7, 18).toISOString())).toBe("12 hours ago");
  });

  it("should switch to calendar Days once a full day has elapsed", () => {
    expect(humanizeSince(ago(24 * 60 * 60_000))).toBe("1 Day ago");
    expect(humanizeSince(ago(25 * 60 * 60_000))).toBe("1 Day ago");
  });

  it("should clamp future and invalid timestamps to 'less than a minute ago'", () => {
    expect(humanizeSince(new Date(NOW.getTime() + 60_000).toISOString())).toBe(
      "less than a minute ago",
    );
    expect(humanizeSince("not-a-date")).toBe("less than a minute ago");
  });

  it("should format days only with correct singular/plural forms", () => {
    vi.setSystemTime(new Date(2026, 7, 18)); // Aug 18, 2026
    expect(humanizeSince(new Date(2026, 7, 17).toISOString())).toBe("1 Day ago");
    expect(humanizeSince(new Date(2026, 7, 13).toISOString())).toBe("5 Days ago");
  });

  it("should format months only with correct singular/plural forms", () => {
    vi.setSystemTime(new Date(2026, 7, 18)); // Aug 18, 2026
    expect(humanizeSince(new Date(2026, 6, 18).toISOString())).toBe("1 Month ago");
    expect(humanizeSince(new Date(2026, 5, 18).toISOString())).toBe("2 Months ago");
  });

  it("should format years only with correct singular/plural forms", () => {
    vi.setSystemTime(new Date(2026, 7, 18)); // Aug 18, 2026
    expect(humanizeSince(new Date(2025, 7, 18).toISOString())).toBe("1 Year ago");
    expect(humanizeSince(new Date(2023, 7, 18).toISOString())).toBe("3 Years ago");
  });

  it("should format combinations of years, months, and days", () => {
    vi.setSystemTime(new Date(2026, 7, 18)); // Aug 18, 2026
    // 1 Year 2 Months 3 Days ago -> 2025-06-15
    expect(humanizeSince(new Date(2025, 5, 15).toISOString())).toBe("1 Year 2 Months 3 Days ago");
    // 2 Years 1 Month ago -> 2024-07-18
    expect(humanizeSince(new Date(2024, 6, 18).toISOString())).toBe("2 Years 1 Month ago");
    // 1 Year 5 Days ago -> 2025-08-13
    expect(humanizeSince(new Date(2025, 7, 13).toISOString())).toBe("1 Year 5 Days ago");
    // 2 Months 1 Day ago -> 2026-06-17
    expect(humanizeSince(new Date(2026, 5, 17).toISOString())).toBe("2 Months 1 Day ago");
  });

  it("should handle negative days borrowing across month boundary", () => {
    // Current date: March 5, 2026
    // Past date: February 20, 2026
    // now.getDate() - past.getDate() = 5 - 20 = -15 < 0
    // months = 2 - 1 = 1 - 1 = 0
    // days = -15 + new Date(2026, 2, 0).getDate() (last day of Feb 2026 = 28) = 13
    vi.setSystemTime(new Date(2026, 2, 5));
    expect(humanizeSince(new Date(2026, 1, 20).toISOString())).toBe("13 Days ago");
  });

  it("should handle negative days borrowing across month boundary in leap year (Feb 29)", () => {
    // Leap year 2024: March 5, 2024
    // Past date: February 20, 2024
    // days = 5 - 20 = -15 + 29 = 14 Days
    vi.setSystemTime(new Date(2024, 2, 5));
    expect(humanizeSince(new Date(2024, 1, 20).toISOString())).toBe("14 Days ago");
  });

  it("should handle negative months borrowing across year boundary", () => {
    // Current date: February 15, 2026
    // Past date: November 15, 2025
    // years = 2026 - 2025 = 1
    // months = 1 - 10 = -9 < 0 -> years -= 1 (0), months += 12 (3)
    // days = 0
    vi.setSystemTime(new Date(2026, 1, 15));
    expect(humanizeSince(new Date(2025, 10, 15).toISOString())).toBe("3 Months ago");
  });

  it("should handle both negative days and negative months borrowing simultaneously", () => {
    // Current date: January 10, 2026
    // Past date: November 25, 2024
    // initial: years = 2, months = 0 - 10 = -10, days = 10 - 25 = -15
    // days < 0: months = -11, days = -15 + new Date(2026, 0, 0).getDate() (Dec 31 = 31) = 16
    // months < 0: years = 2 - 1 = 1, months = -11 + 12 = 1
    // result: "1 Year 1 Month 16 Days ago"
    vi.setSystemTime(new Date(2026, 0, 10));
    expect(humanizeSince(new Date(2024, 10, 25).toISOString())).toBe("1 Year 1 Month 16 Days ago");
  });
});
