import { getReadableTimeDifference } from "./elapsed-time.util";

describe("getReadableTimeDifference", () => {
  it("returns '0 seconds' when dates are identical (zero difference)", () => {
    const d1 = new Date(Date.UTC(2026, 0, 1, 12, 0, 0));
    const d2 = new Date(Date.UTC(2026, 0, 1, 12, 0, 0));
    expect(getReadableTimeDifference(d1, d2)).toBe("0 seconds");
  });

  it("handles negative time difference symmetrically (order of dates does not matter)", () => {
    const d1 = new Date(Date.UTC(2026, 0, 1, 12, 0, 0));
    const d2 = new Date(Date.UTC(2026, 0, 1, 12, 5, 0));
    expect(getReadableTimeDifference(d1, d2)).toBe("5 minutes");
    expect(getReadableTimeDifference(d2, d1)).toBe("5 minutes");
  });

  describe("single unit durations (singular and plural)", () => {
    it("handles 1 second and multiple seconds", () => {
      const start = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
      const oneSec = new Date(Date.UTC(2026, 0, 1, 0, 0, 1));
      const manySec = new Date(Date.UTC(2026, 0, 1, 0, 0, 45));

      expect(getReadableTimeDifference(start, oneSec)).toBe("1 second");
      expect(getReadableTimeDifference(start, manySec)).toBe("45 seconds");
    });

    it("handles 1 minute and multiple minutes", () => {
      const start = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
      const oneMin = new Date(Date.UTC(2026, 0, 1, 0, 1, 0));
      const manyMin = new Date(Date.UTC(2026, 0, 1, 0, 30, 0));

      expect(getReadableTimeDifference(start, oneMin)).toBe("1 minute");
      expect(getReadableTimeDifference(start, manyMin)).toBe("30 minutes");
    });

    it("handles 1 hour and multiple hours", () => {
      const start = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
      const oneHour = new Date(Date.UTC(2026, 0, 1, 1, 0, 0));
      const manyHours = new Date(Date.UTC(2026, 0, 1, 15, 0, 0));

      expect(getReadableTimeDifference(start, oneHour)).toBe("1 hour");
      expect(getReadableTimeDifference(start, manyHours)).toBe("15 hours");
    });

    it("handles 1 day and multiple days", () => {
      const start = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
      const oneDay = new Date(Date.UTC(2026, 0, 2, 0, 0, 0));
      const manyDays = new Date(Date.UTC(2026, 0, 10, 0, 0, 0));

      expect(getReadableTimeDifference(start, oneDay)).toBe("1 day");
      expect(getReadableTimeDifference(start, manyDays)).toBe("9 days");
    });
  });

  describe("largest two non-zero units selection", () => {
    it("renders days and hours when both are non-zero (omitting minutes and seconds)", () => {
      const start = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
      const end = new Date(Date.UTC(2026, 0, 3, 4, 15, 30)); // 2 days, 4 hours, 15 mins, 30 secs
      expect(getReadableTimeDifference(start, end)).toBe("2 days, 4 hours");
    });

    it("renders days and minutes when hours is 0", () => {
      const start = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
      const end = new Date(Date.UTC(2026, 0, 2, 0, 45, 10)); // 1 day, 0 hours, 45 mins, 10 secs
      expect(getReadableTimeDifference(start, end)).toBe("1 day, 45 minutes");
    });

    it("renders days and seconds when hours and minutes are 0", () => {
      const start = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
      const end = new Date(Date.UTC(2026, 0, 4, 0, 0, 5)); // 3 days, 0 hours, 0 mins, 5 secs
      expect(getReadableTimeDifference(start, end)).toBe("3 days, 5 seconds");
    });

    it("renders hours and minutes when days is 0", () => {
      const start = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
      const end = new Date(Date.UTC(2026, 0, 1, 5, 20, 10)); // 5 hours, 20 mins, 10 secs
      expect(getReadableTimeDifference(start, end)).toBe("5 hours, 20 minutes");
    });

    it("renders hours and seconds when days is 0 and minutes is 0", () => {
      const start = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
      const end = new Date(Date.UTC(2026, 0, 1, 1, 0, 1)); // 1 hour, 0 mins, 1 sec
      expect(getReadableTimeDifference(start, end)).toBe("1 hour, 1 second");
    });

    it("renders minutes and seconds when days and hours are 0", () => {
      const start = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
      const end = new Date(Date.UTC(2026, 0, 1, 0, 2, 1)); // 2 mins, 1 sec
      expect(getReadableTimeDifference(start, end)).toBe("2 minutes, 1 second");
    });
  });

  describe("sub-second differences", () => {
    it("returns '0 seconds' when difference is less than 1000ms", () => {
      const start = new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 0));
      const end = new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 800));
      expect(getReadableTimeDifference(start, end)).toBe("0 seconds");
    });
  });
});
