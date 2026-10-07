import { provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { metricTooltip } from "../../../core/methodology/methodology-render.util";
import type { LineStatusHourBucket } from "../data/home.queries";
import { HomeStore } from "../data/home.store";
import { NetworkSparklineComponent } from "./network-sparkline.component";

/** 03:00 MYT — the service day's first bucket. UTC+8 so the fixture is the same instant everywhere. */
const HOUR_03 = "2026-09-21T19:00:00+00:00";

function hour(count: number, index = 0, overrides: Partial<LineStatusHourBucket> = {}) {
  const start = new Date(new Date(HOUR_03).getTime() + index * 3600_000).toISOString();
  return {
    hourStart: start,
    hourEnd: new Date(new Date(HOUR_03).getTime() + (index + 1) * 3600_000).toISOString(),
    count,
    dominantStatus: count > 0 ? "NORMAL" : null,
    statusCounts: count > 0 ? [{ status: "NORMAL", count }] : [],
    ...overrides,
  } as LineStatusHourBucket;
}

/** A full 24-bucket service day with reports only in the first three hours. */
function serviceDay(): LineStatusHourBucket[] {
  return Array.from({ length: 24 }, (_unused, index) => hour(index < 3 ? index + 1 : 0, index));
}

describe("NetworkSparklineComponent", () => {
  let fixture: ComponentFixture<NetworkSparklineComponent>;
  let buckets: ReturnType<typeof signal<LineStatusHourBucket[]>>;
  let failed: ReturnType<typeof signal<boolean>>;
  let lines: ReturnType<typeof signal<number>>;
  let requestHistoryReads: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    buckets = signal<LineStatusHourBucket[]>([]);
    failed = signal(false);
    lines = signal(16);
    requestHistoryReads = vi.fn();

    await TestBed.configureTestingModule({
      imports: [NetworkSparklineComponent],
      providers: [
        provideZonelessChangeDetection(),
        // The sparkline's popover carries a `/methodology` link, so the router must resolve it.
        provideRouter([]),
        {
          provide: HomeStore,
          useValue: {
            networkHistory: buckets,
            networkHistoryFailed: failed,
            lines,
            requestHistoryReads,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NetworkSparklineComponent);
  });

  function render(): HTMLElement {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it("asks the store for the network read — the widget owns the opt-in, not the page", () => {
    render();
    expect(requestHistoryReads).toHaveBeenCalledTimes(1);
  });

  it("draws one bar per service-day hour, tall by count", () => {
    buckets.set(serviceDay());
    const root = render();

    expect(root.querySelectorAll('[data-testid="sparkline-bar"]')).toHaveLength(24);
    const bars = [...root.querySelectorAll<HTMLElement>('[data-testid="sparkline-bar"]')];
    // Counts 1, 2, 3 then twenty-one quiet hours, so the busiest hour is full height and the first is
    // the scaled-down one.
    expect(bars[0]?.style.height).toBe("33.33333333333333%");
    expect(bars[2]?.style.height).toBe("100%");
    expect(bars[3]?.style.height).toBe("0%");
    // Hours are named in Malaysia time, and the axis names the window at both ends.
    expect(bars[0]?.getAttribute("data-hour")).toBe("03");
    expect(bars[23]?.getAttribute("data-hour")).toBe("02");
  });

  it("colours each bar by the status that dominated its hour", () => {
    buckets.set([
      hour(2, 0, { dominantStatus: "DELAYED", statusCounts: [{ status: "DELAYED", count: 2 }] }),
      hour(1, 1, { dominantStatus: "NORMAL", statusCounts: [{ status: "NORMAL", count: 1 }] }),
      hour(0, 2),
    ]);
    const root = render();

    const bars = [...root.querySelectorAll<HTMLElement>('[data-testid="sparkline-bar"]')];
    expect(bars[0]?.className).toContain("bg-yellow-500");
    expect(bars[1]?.className).toContain("bg-emerald-500");
    // An hour nobody reported is the muted track, not a Normal green: silence is not a good hour.
    expect(bars[2]?.className).toContain("bg-muted");
  });

  it("gives the whole strip ONE accessible sentence instead of announcing 24 bars", () => {
    buckets.set(serviceDay());
    const root = render();

    const chart = root.querySelector('[data-testid="network-sparkline-bars"]');
    expect(chart?.getAttribute("role")).toBe("img");
    const label = chart?.getAttribute("aria-label") ?? "";
    // What is counted, over which window, how much, and when the peak was — the four facts the bars
    // and their tooltips carry between them.
    expect(label).toContain("across every line on the network");
    expect(label).toContain("service day 03:00 to 02:00");
    expect(label).toContain("6 reports in 3 of 24 hours");
    expect(label).toContain("Busiest hour 05:00–06:00");
    // …and the cells themselves stay out of the accessibility tree, keeping their detail in `title`.
    for (const bar of root.querySelectorAll('[data-testid="sparkline-bar"]')) {
      expect(bar.getAttribute("aria-hidden")).toBe("true");
      expect(bar.getAttribute("title")).toBeTruthy();
    }
  });

  it("carries each bar's hour, total and breakdown in its tooltip", () => {
    buckets.set([
      hour(4, 0, {
        dominantStatus: "BUSY",
        statusCounts: [
          { status: "BUSY", count: 1 },
          { status: "CROWDED", count: 3 },
        ],
      }),
    ]);
    const root = render();

    expect(root.querySelector('[data-testid="sparkline-bar"]')?.getAttribute("title")).toBe(
      "03:00–04:00 · 4 reports · Busy 1, Crowded 3",
    );
  });

  it("shows the day's total, and says the read is about the NETWORK", () => {
    buckets.set(serviceDay());
    const root = render();

    expect((root.textContent ?? "").replace(/\s+/g, " ")).toContain("6 reports");
    // The wording is the load-bearing part: this read tallies EVERY line, so it must never read as
    // one line's history.
    expect((root.textContent ?? "").replace(/\s+/g, " ")).toContain("Network activity");
  });

  it("publishes its definition from the methodology registry, never a literal", () => {
    buckets.set(serviceDay());
    const root = render();

    const trigger = root
      .querySelector('[data-testid="network-sparkline"]')
      ?.querySelector("button");
    trigger?.click();
    fixture.detectChanges();

    const panel = root.querySelector('[data-testid="network-sparkline-popover"]');
    expect(panel?.querySelectorAll("p")[1]?.textContent?.trim()).toBe(
      metricTooltip("network.activity-sparkline"),
    );
    expect(panel?.querySelector("a")?.getAttribute("href")).toBe("/methodology#line-status");
  });

  it("shows an empty placeholder of the CHART's own height when nothing was reported", () => {
    buckets.set([]);
    const root = render();

    // `[]` is the backend's no-data answer, not a failure — and it is not a chart of twenty-four
    // nothing-happened hours either. But the widget still HOLDS its space, so the hero does not
    // change height under the reader when the slow read finally lands.
    expect(root.querySelector('[data-testid="network-sparkline"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="sparkline-bar"]')).toBeNull();

    const empty = root.querySelector<HTMLElement>('[data-testid="network-sparkline-empty"]');
    expect(empty?.textContent?.replace(/\s+/g, " ").trim()).toBe("No activity reported yet");
    // The one property that makes this work: same height as the bars it replaces.
    expect(empty?.className.split(/\s+/)).toContain("h-10");
  });

  it("says so differently on a FAILED read, without touching the page's error state", () => {
    buckets.set(serviceDay());
    failed.set(true);
    const root = render();

    // 🔴 The acceptance rule, from the widget's side: a sparkline that will not load says nothing
    // that could be mistaken for a chart, and it never asks the page to raise an error — the store
    // keeps `networkHistoryFailed` out of `hasError` precisely so this branch is the whole of the
    // failure handling.
    expect(root.querySelector('[data-testid="network-sparkline"]')).not.toBeNull();
    const empty = root.querySelector<HTMLElement>('[data-testid="network-sparkline-empty"]');
    expect(empty?.textContent?.replace(/\s+/g, " ").trim()).toBe("Activity data unavailable");
    expect(empty?.className.split(/\s+/)).toContain("h-10");
    // No bars are drawn from a read that failed, even though the store still holds the last answer.
    expect(root.querySelector('[data-testid="network-sparkline-bars"]')).toBeNull();
  });
});
