import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  dateKeyOf,
  SpottingActivityHeatmap,
  spottingIntensityClass,
  toSpottingActivityPoints,
} from "./spotting-activity-heatmap";

/**
 * The instant of a naive Kuala Lumpur wall time as the API sends it ("2026-10-01T05:23:15.833490":
 * no offset, `USE_TZ = False`). Malaysia is a fixed UTC+8, and a Date keeps milliseconds only.
 */
function mytInstant(wall: string): Date {
  return new Date(`${wall.slice(0, 23)}+08:00`);
}

describe("SpottingActivityHeatmap smoke", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (_cb: FrameRequestCallback) => 0);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates and renders without throwing", async () => {
    await TestBed.configureTestingModule({
      imports: [SpottingActivityHeatmap],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture: ComponentFixture<SpottingActivityHeatmap> =
      TestBed.createComponent(SpottingActivityHeatmap);
    fixture.componentRef.setInput("data", []);
    fixture.componentRef.setInput("totalAllTime", 0);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance).toBeTruthy();
  });
});

/**
 * The same inputs in the SSR server's zone (UTC) and a Malaysian browser's. A case that is wrong
 * today runs as `it.fails`, naming its open finding: fixing the finding makes it fail, so flip it to
 * `it` then.
 */
describe.each(["UTC", "Asia/Kuala_Lumpur"])("heatmap date helpers in TZ=%s", (zone) => {
  beforeAll(() => {
    vi.stubEnv("TZ", zone);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  describe("dateKeyOf", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("keys a date-only value to its own day", () => {
      expect(dateKeyOf(new Date("2026-10-01"))).toBe("2026-10-01");
      expect(dateKeyOf(new Date("2024-02-29"))).toBe("2024-02-29");
    });

    it("keys the UTC-midnight days the grids build to their own day", () => {
      expect(dateKeyOf(new Date(Date.UTC(2026, 9, 1)))).toBe("2026-10-01");
      // Day 0 of October is the last day of September.
      expect(dateKeyOf(new Date(Date.UTC(2026, 9, 0)))).toBe("2026-09-30");
    });

    it("gives the Kuala Lumpur day as today's key late in the evening", () => {
      vi.useFakeTimers();
      vi.setSystemTime(mytInstant("2026-09-30T23:59:59"));

      expect(dateKeyOf(new Date())).toBe("2026-09-30");
    });

    // F436: the heatmap's and the grid's today key is a UTC day, a day behind until 08:00 MYT.
    it.fails.each(["2026-10-01T00:00:00", "2026-10-01T05:23:15.833490"])(
      "gives the Kuala Lumpur day as today's key at %s (F436)",
      (wall) => {
        vi.useFakeTimers();
        vi.setSystemTime(mytInstant(wall));

        expect(dateKeyOf(new Date())).toBe("2026-10-01");
      },
    );
  });

  describe("toSpottingActivityPoints", () => {
    it("counts spottings per day and type, keyed by the API's date-only day", () => {
      const points = toSpottingActivityPoints([
        { spottingDate: "2026-09-30", type: "AT_STATION" },
        { spottingDate: "2026-10-01", type: "AT_STATION" },
        { spottingDate: "2026-10-01", type: "AT_STATION" },
        { spottingDate: "2026-10-01", type: "DEPOT" },
      ]);

      expect(points).toEqual([
        { dateKey: "2026-09-30", eventType: "AT_STATION", count: 1 },
        { dateKey: "2026-10-01", eventType: "AT_STATION", count: 2 },
        { dateKey: "2026-10-01", eventType: "DEPOT", count: 1 },
      ]);
    });

    it("keys each point to the same day the heatmap's own cells use", () => {
      const [point] = toSpottingActivityPoints([{ spottingDate: "2026-10-01", type: "DEPOT" }]);

      expect(point.dateKey).toBe(dateKeyOf(new Date(Date.UTC(2026, 9, 1))));
    });

    it("returns no points for no spottings", () => {
      expect(toSpottingActivityPoints([])).toEqual([]);
    });
  });
});

describe("spottingIntensityClass", () => {
  it("is muted for an empty day and darkens by quarter of the busiest day", () => {
    expect(spottingIntensityClass(0, 8)).toBe("bg-muted");
    expect(spottingIntensityClass(2, 8)).toBe("bg-primary/25");
    expect(spottingIntensityClass(3, 8)).toBe("bg-primary/45");
    expect(spottingIntensityClass(5, 8)).toBe("bg-primary/70");
    expect(spottingIntensityClass(7, 8)).toBe("bg-primary");
  });

  it("treats a busiest day of 0 as 1, so a stray count never divides by zero", () => {
    expect(spottingIntensityClass(1, 0)).toBe("bg-primary");
  });
});
