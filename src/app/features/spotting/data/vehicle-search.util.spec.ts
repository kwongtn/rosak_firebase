import { describe, expect, it } from "vitest";
import { allowRunNumber, numberSeenToSetNumbers } from "./vehicle-search.util";

describe("numberSeenToSetNumbers", () => {
  describe("falsy and empty input handling", () => {
    it("should return empty array for undefined or empty string", () => {
      expect(numberSeenToSetNumbers(undefined, "4")).toEqual([]);
      expect(numberSeenToSetNumbers("", "4")).toEqual([]);
    });
  });

  describe("Rapid Rail lines (lines 4, 5, 9, 1, 2, 3)", () => {
    it("line 4 (LRT Kelana Jaya Line): triggerLength 3, startConcat 1, endConcat 3", () => {
      expect(numberSeenToSetNumbers("123", "4")).toEqual(["23"]);
      expect(numberSeenToSetNumbers("12", "4")).toEqual([]);
      expect(numberSeenToSetNumbers("1234", "4")).toEqual([]);
    });

    it("line 5 (LRT Ampang Line): triggerLength 4, startConcat 0, endConcat 3", () => {
      expect(numberSeenToSetNumbers("1234", "5")).toEqual(["123"]);
      expect(numberSeenToSetNumbers("123", "5")).toEqual([]);
    });

    it("line 9 (LRT Sri Petaling Line): triggerLength 4, startConcat 0, endConcat 3", () => {
      expect(numberSeenToSetNumbers("1234", "9")).toEqual(["123"]);
      expect(numberSeenToSetNumbers("12345", "9")).toEqual([]);
    });

    it("line 1 (Monorail): triggerLength 4, startConcat 0, endConcat 2", () => {
      expect(numberSeenToSetNumbers("1234", "1")).toEqual(["12"]);
      expect(numberSeenToSetNumbers("123", "1")).toEqual([]);
    });

    it("line 2 (MRT Kajang Line): triggerLength 4, startConcat 0, endConcat 3", () => {
      expect(numberSeenToSetNumbers("1234", "2")).toEqual(["123"]);
      expect(numberSeenToSetNumbers("12", "2")).toEqual([]);
    });

    it("line 3 (MRT Putrajaya Line): triggerLength 4, startConcat 0, endConcat 3", () => {
      expect(numberSeenToSetNumbers("1234", "3")).toEqual(["123"]);
      expect(numberSeenToSetNumbers("12345", "3")).toEqual([]);
    });
  });

  describe("KTM lines (lines 6, 7, 13, 14, 10, 20)", () => {
    const ktmLines = ["6", "7", "13", "14", "10", "20"];

    ktmLines.forEach((line) => {
      it(`should return empty array on line ${line} when input length/format is invalid`, () => {
        expect(numberSeenToSetNumbers("123", line)).toEqual([]);
        expect(numberSeenToSetNumbers("C12345", line)).toEqual([]);
        expect(numberSeenToSetNumbers("C123", line)).toEqual([]); // 4 chars with C prefix
        expect(numberSeenToSetNumbers("12345", line)).toEqual([]); // 5 chars without prefix
      });
    });

    describe("Class 92 (SCS)", () => {
      it("should format class 92 5-char with coach class prefix C/T/M/D and 4-char without prefix", () => {
        // coachNum = 04 -> ceil(4/2) = 2 -> "SCS02"
        expect(numberSeenToSetNumbers("C9204", "6")).toEqual(["SCS02"]);
        expect(numberSeenToSetNumbers("t9203", "6")).toEqual(["SCS02"]); // lowercase class coach
        expect(numberSeenToSetNumbers("M9201", "7")).toEqual(["SCS01"]);
        expect(numberSeenToSetNumbers("D9210", "13")).toEqual(["SCS05"]);
        expect(numberSeenToSetNumbers("9204", "14")).toEqual(["SCS02"]);
      });
    });

    describe("Class 81 (EMU)", () => {
      it("should handle 5-char with coachClass 'C' (halved coach number)", () => {
        expect(numberSeenToSetNumbers("C8104", "6")).toEqual(["EMU02"]);
        expect(numberSeenToSetNumbers("c8103", "6")).toEqual(["EMU02"]);
      });

      it("should handle 5-char with coachClass other than 'C' (T, M, D) (unhalved coach number)", () => {
        expect(numberSeenToSetNumbers("T8104", "6")).toEqual(["EMU04"]);
        expect(numberSeenToSetNumbers("M8105", "10")).toEqual(["EMU05"]);
        expect(numberSeenToSetNumbers("D8101", "20")).toEqual(["EMU01"]);
      });

      it("should handle 4-char without coach class prefix (returns unhalved and halved)", () => {
        expect(numberSeenToSetNumbers("8104", "6")).toEqual(["EMU04", "EMU02"]);
        expect(numberSeenToSetNumbers("8103", "7")).toEqual(["EMU03", "EMU02"]);
      });
    });

    describe("Class 83 (EMU + 18)", () => {
      it("should handle 5-char with coachClass 'C' (halved coach number + 18)", () => {
        expect(numberSeenToSetNumbers("C8304", "6")).toEqual(["EMU20"]); // ceil(4/2) + 18 = 20
        expect(numberSeenToSetNumbers("c8303", "6")).toEqual(["EMU20"]);
      });

      it("should handle 5-char with coachClass other than 'C' (T, M, D) (coach number + 18)", () => {
        expect(numberSeenToSetNumbers("T8304", "6")).toEqual(["EMU22"]); // 4 + 18 = 22
        expect(numberSeenToSetNumbers("M8301", "10")).toEqual(["EMU19"]); // 1 + 18 = 19
        expect(numberSeenToSetNumbers("D8306", "20")).toEqual(["EMU24"]); // 6 + 18 = 24
      });

      it("should handle 4-char without coach class prefix (returns [coach+18, ceil(coach/2)+18])", () => {
        expect(numberSeenToSetNumbers("8304", "6")).toEqual(["EMU22", "EMU20"]);
      });
    });

    describe("Class 91 (ETS 1)", () => {
      it("should format class 91 with 'ETS 1'", () => {
        expect(numberSeenToSetNumbers("C9104", "10")).toEqual(["ETS 102"]);
        expect(numberSeenToSetNumbers("T9103", "10")).toEqual(["ETS 102"]);
        expect(numberSeenToSetNumbers("9104", "10")).toEqual(["ETS 102"]);
      });
    });

    describe("Class 93 (ETS 2)", () => {
      it("should format class 93 with 'ETS 2'", () => {
        expect(numberSeenToSetNumbers("M9304", "10")).toEqual(["ETS 202"]);
        expect(numberSeenToSetNumbers("D9303", "10")).toEqual(["ETS 202"]);
        expect(numberSeenToSetNumbers("9304", "10")).toEqual(["ETS 202"]);
      });
    });

    describe("Class 61 (DMU)", () => {
      it("should format class 61 with 'DMU '", () => {
        expect(numberSeenToSetNumbers("C6104", "20")).toEqual(["DMU 02"]);
        expect(numberSeenToSetNumbers("T6103", "20")).toEqual(["DMU 02"]);
        expect(numberSeenToSetNumbers("6104", "20")).toEqual(["DMU 02"]);
      });
    });

    describe("Unknown class numbers under KTM lines", () => {
      it("should return empty array for unsupported class number on KTM lines", () => {
        expect(numberSeenToSetNumbers("C9904", "6")).toEqual([]);
        expect(numberSeenToSetNumbers("9904", "6")).toEqual([]);
      });
    });
  });

  describe("Unsupported line IDs", () => {
    it("should return empty array for unsupported line IDs", () => {
      expect(numberSeenToSetNumbers("1234", "99")).toEqual([]);
      expect(numberSeenToSetNumbers("C9204", "xyz")).toEqual([]);
      expect(numberSeenToSetNumbers("123", "")).toEqual([]);
    });
  });
});

describe("allowRunNumber", () => {
  it("should return true for line '2' (MRT Kajang) and line '3' (MRT Putrajaya)", () => {
    expect(allowRunNumber("2")).toBe(true);
    expect(allowRunNumber("3")).toBe(true);
  });

  it("should return false for other line IDs", () => {
    expect(allowRunNumber("1")).toBe(false);
    expect(allowRunNumber("4")).toBe(false);
    expect(allowRunNumber("5")).toBe(false);
    expect(allowRunNumber("6")).toBe(false);
    expect(allowRunNumber("7")).toBe(false);
    expect(allowRunNumber("9")).toBe(false);
    expect(allowRunNumber("10")).toBe(false);
    expect(allowRunNumber("13")).toBe(false);
    expect(allowRunNumber("14")).toBe(false);
    expect(allowRunNumber("20")).toBe(false);
    expect(allowRunNumber("")).toBe(false);
    expect(allowRunNumber("unknown")).toBe(false);
  });
});
