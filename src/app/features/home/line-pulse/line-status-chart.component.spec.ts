import { provideZonelessChangeDetection } from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RetryBannerComponent } from "../../../ui/retry-banner/retry-banner.component";
import { LineStatusHourBucket } from "../data/home.queries";
import {
  CHART_STATE_MIN_HEIGHT_CLASS,
  LineStatusChartComponent,
} from "./line-status-chart.component";

/** 03:00–05:00 in Malaysia time — the service-day buckets the backend emits. */
function makeBuckets(): LineStatusHourBucket[] {
  return [
    {
      hourStart: "2026-09-21T19:00:00+00:00",
      hourEnd: "2026-09-21T20:00:00+00:00",
      count: 4,
      dominantStatus: "CROWDED",
      statusCounts: [
        { status: "BUSY", count: 1 },
        { status: "CROWDED", count: 3 },
      ],
    },
    {
      hourStart: "2026-09-21T20:00:00+00:00",
      hourEnd: "2026-09-21T21:00:00+00:00",
      count: 0,
      dominantStatus: null,
      statusCounts: [],
    },
    {
      hourStart: "2026-09-21T21:00:00+00:00",
      hourEnd: "2026-09-21T22:00:00+00:00",
      count: 2,
      dominantStatus: "DELAYED",
      statusCounts: [{ status: "DELAYED", count: 2 }],
    },
  ];
}

/** The service day's hours in order: 03:00 MYT rolls all the way to 02:00 the next morning. */
const SERVICE_DAY_HOURS = [
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
  "09",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "20",
  "21",
  "22",
  "23",
  "00",
  "01",
  "02",
];

/** The full 24 hourly buckets the backend returns for one service day. */
function makeServiceDayBuckets(): LineStatusHourBucket[] {
  return SERVICE_DAY_HOURS.map((_, index) => {
    const count = index % 4;
    return {
      hourStart: new Date(Date.UTC(2026, 8, 21, 19 + index)).toISOString(),
      hourEnd: new Date(Date.UTC(2026, 8, 21, 20 + index)).toISOString(),
      count,
      dominantStatus: count === 0 ? null : "BUSY",
      statusCounts: count === 0 ? [] : [{ status: "BUSY", count }],
    };
  });
}

/** The segment divs of one hour's bar — segments hold no nested divs, so a plain `div` query
 * returns exactly the stack. */
function segmentsOf(bar: Element | undefined): HTMLElement[] {
  return [...(bar?.querySelectorAll<HTMLElement>("div") ?? [])];
}

/** Each segment's inline height percentage, in DOM order (which `flex-col-reverse` reads
 * bottom-up: the first segment sits at the bottom of the bar). */
function segmentHeightsOf(bar: Element | undefined): number[] {
  return segmentsOf(bar).map((segment) => Number.parseFloat(segment.style.height));
}

function sumOf(heights: number[]): number {
  return heights.reduce((sum, height) => sum + height, 0);
}

/**
 * jsdom performs no layout, so a pixel measurement is impossible here. Equality is instead
 * asserted on the height utilities each state renders — the single shared source of truth that
 * resolves to the same reserved height for both.
 */
function heightUtilitiesOf(el: Element | null): string[] {
  expect(el).not.toBeNull();
  return [...(el as Element).classList]
    .filter((name) => name === "h-full" || name.startsWith("h-") || name.startsWith("min-h-"))
    .sort();
}

describe("LineStatusChartComponent", () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LineStatusChartComponent],
      providers: [provideZonelessChangeDetection(), provideHttpClientTesting()],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function render(
    expanded: boolean,
    lineId = "line-1",
  ): ComponentFixture<LineStatusChartComponent> {
    const fixture = TestBed.createComponent(LineStatusChartComponent);
    fixture.componentRef.setInput("lineId", lineId);
    fixture.componentRef.setInput("expanded", expanded);
    fixture.detectChanges();
    return fixture;
  }

  async function flushBuckets(
    fixture: ComponentFixture<LineStatusChartComponent>,
    buckets: LineStatusHourBucket[],
  ): Promise<void> {
    const request = httpMock.expectOne((r) => r.body.query.includes("LineStatusHistory"));
    request.flush({ data: { lineStatusHistory: buckets } });
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it("renders nothing and fetches nothing until expanded", () => {
    const fixture = render(false);
    const root = fixture.nativeElement as HTMLElement;

    expect(httpMock.match(() => true)).toHaveLength(0);
    expect(root.querySelector('[data-testid="line-status-chart"]')).toBeNull();
  });

  it("reads the current service day's hourly buckets once expanded", async () => {
    const fixture = render(true, "line-9");

    const request = httpMock.expectOne((r) => r.body.query.includes("LineStatusHistory"));
    expect(request.request.body.variables).toEqual({ lineId: "line-9", dayStartHour: 3 });

    request.flush({ data: { lineStatusHistory: makeBuckets() } });
    await fixture.whenStable();
    fixture.detectChanges();

    const bars = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '[data-testid="line-status-bar"]',
    );
    expect(bars).toHaveLength(3);
  });

  it("scales each bar to the busiest hour and labels hour, count and status breakdown", async () => {
    const fixture = render(true);
    await flushBuckets(fixture, makeBuckets());

    const root = fixture.nativeElement as HTMLElement;
    const bars = [...root.querySelectorAll<HTMLElement>('[data-testid="line-status-bar"]')];

    expect(bars[0]?.dataset["hour"]).toBe("03");
    expect(bars[0]?.getAttribute("title")).toBe("03:00–04:00 · 4 reports · Busy 1, Crowded 3");
    expect(bars[2]?.getAttribute("title")).toBe("05:00–06:00 · 2 reports · Delayed 2");

    // The busiest hour's bar is full height, split into its statuses' shares; the half-hour is
    // half height; the empty hour renders no segments at all.
    expect(segmentHeightsOf(bars[0])).toEqual([25, 75]);
    expect(segmentHeightsOf(bars[2])).toEqual([50]);
    expect(segmentHeightsOf(bars[1])).toEqual([]);
    expect(sumOf(segmentHeightsOf(bars[0]))).toBeCloseTo(100);
    expect(sumOf(segmentHeightsOf(bars[2]))).toBeCloseTo(50);

    expect(root.querySelector('[data-testid="line-status-chart"]')?.textContent).toContain("03");
  });

  it("stacks one hour's bar bottom-up by severity, sized by each status's share of the hour", async () => {
    const fixture = render(true);
    await flushBuckets(fixture, [
      {
        hourStart: "2026-09-21T19:00:00+00:00",
        hourEnd: "2026-09-21T20:00:00+00:00",
        count: 3,
        dominantStatus: "CROWDED",
        statusCounts: [
          { status: "CROWDED", count: 2 },
          { status: "BUSY", count: 1 },
        ],
      },
    ]);

    const root = fixture.nativeElement as HTMLElement;
    const bar = root.querySelector<HTMLElement>('[data-testid="line-status-bar"]');
    const segments = segmentsOf(bar ?? undefined);

    expect(segments).toHaveLength(2);
    // DOM order is PASSENGER_SCALE order (NORMAL → DISRUPTED) and the container is
    // `flex-col-reverse`, so the first segment — the lowest severity — sits at the BOTTOM.
    expect(bar?.className).toContain("flex-col-reverse");
    expect(segments[0]?.className).toContain("bg-blue-500");
    expect(segments[1]?.className).toContain("bg-amber-500");
    const heights = segmentHeightsOf(bar ?? undefined);
    expect(heights[0]).toBeCloseTo(100 / 3);
    expect(heights[1]).toBeCloseTo(200 / 3);
    expect(sumOf(heights)).toBeCloseTo(100);
    // Every segment carries the `last:` variant; CSS narrows it to `:last-child`, which
    // `flex-col-reverse` places on top, so only the highest-severity segment rounds its top and
    // the stack reads as one bar.
    expect(segments.at(-1)?.className).toContain("last:rounded-t-[2px]");
    // The testid stays on the hour container: segments must never multiply that count.
    expect(bar?.querySelectorAll('[data-testid="line-status-bar"]')).toHaveLength(0);
  });

  it("falls back to a single dominant-status segment when a bucket carries no status counts", async () => {
    const fixture = render(true);
    await flushBuckets(fixture, [
      {
        hourStart: "2026-09-21T19:00:00+00:00",
        hourEnd: "2026-09-21T20:00:00+00:00",
        count: 2,
        dominantStatus: "DISRUPTED",
        statusCounts: [],
      },
    ]);

    const root = fixture.nativeElement as HTMLElement;
    const bar = root.querySelector<HTMLElement>('[data-testid="line-status-bar"]');
    const segments = segmentsOf(bar ?? undefined);

    expect(segments).toHaveLength(1);
    expect(segments[0]?.className).toContain("bg-rose-600");
    expect(segmentHeightsOf(bar ?? undefined)).toEqual([100]);
    expect(bar?.getAttribute("title")).toBe("03:00–04:00 · 2 reports · Disrupted 2");
  });

  it("shows an empty state when the service day has no reports", async () => {
    const fixture = render(true);
    await flushBuckets(
      fixture,
      makeBuckets().map((bucket) => ({
        ...bucket,
        count: 0,
        dominantStatus: null,
        statusCounts: [],
      })),
    );

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="line-status-chart-empty"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="line-status-bar"]')).toBeNull();
  });

  it("renders a readable hour label for every bucket of the service day, never a sampled subset", async () => {
    const fixture = render(true);
    await flushBuckets(fixture, makeServiceDayBuckets());

    const root = fixture.nativeElement as HTMLElement;
    const bars = [...root.querySelectorAll('[data-testid="line-status-bar"]')];
    const ticks = [...root.querySelectorAll<HTMLElement>('[data-testid="line-status-tick"]')];

    expect(bars).toHaveLength(24);
    expect(ticks).toHaveLength(24);
    expect(ticks.map((tick) => (tick.textContent ?? "").trim())).toEqual(SERVICE_DAY_HOURS);

    const axisStrip = ticks[0]?.parentElement?.parentElement;
    expect(axisStrip?.className).toContain("min-w-");
    expect(axisStrip?.parentElement?.className).toContain("overflow-x-auto");
  });

  it("keeps the hover readout wired to the bars inside the scrolled axis strip", async () => {
    const fixture = render(true);
    await flushBuckets(fixture, makeServiceDayBuckets());

    const root = fixture.nativeElement as HTMLElement;
    const secondBar = root.querySelectorAll<HTMLElement>('[data-testid="line-status-bar"]')[1];
    secondBar?.dispatchEvent(new MouseEvent("mouseenter"));
    fixture.detectChanges();

    const readout = root.querySelector('[data-testid="line-status-chart-readout"]');
    expect(readout?.textContent).toContain("04:00–05:00");
    expect(readout?.textContent).toContain("1 report");
    // The readout shows what the bar is made of, in severity order, with a swatch per status.
    expect(readout?.textContent).toContain("Busy 1");
    expect(readout?.querySelector(".bg-blue-500")).not.toBeNull();
  });

  it("shows only the range and total in the readout for an hour with no reports", async () => {
    const fixture = render(true);
    await flushBuckets(fixture, makeServiceDayBuckets());

    const root = fixture.nativeElement as HTMLElement;
    const emptyBar = root.querySelectorAll<HTMLElement>('[data-testid="line-status-bar"]')[0];
    emptyBar?.dispatchEvent(new MouseEvent("mouseenter"));
    fixture.detectChanges();

    const readout = root.querySelector('[data-testid="line-status-chart-readout"]');
    expect(readout?.textContent).toContain("03:00–04:00");
    expect(readout?.textContent).toContain("0 reports");
    expect(readout?.textContent).not.toContain("Busy");
  });

  it("reserves the same height for the loading skeleton and the no-data state", async () => {
    const fixture = render(true);
    const root = fixture.nativeElement as HTMLElement;

    const skeleton = root.querySelector('[data-testid="line-status-chart-skeleton"]');
    expect(skeleton).not.toBeNull();
    expect(heightUtilitiesOf(skeleton)).toContain(CHART_STATE_MIN_HEIGHT_CLASS);

    await flushBuckets(
      fixture,
      makeBuckets().map((bucket) => ({
        ...bucket,
        count: 0,
        dominantStatus: null,
        statusCounts: [],
      })),
    );

    const empty = root.querySelector('[data-testid="line-status-chart-empty"]');
    expect(empty).not.toBeNull();
    expect(heightUtilitiesOf(empty)).toEqual(heightUtilitiesOf(skeleton));
  });

  it("gives the loaded chart the same reserved height as the skeleton", async () => {
    const fixture = render(true);
    const root = fixture.nativeElement as HTMLElement;
    const skeletonClasses = heightUtilitiesOf(
      root.querySelector('[data-testid="line-status-chart-skeleton"]'),
    );

    await flushBuckets(fixture, makeServiceDayBuckets());

    const readout = root.querySelector('[data-testid="line-status-chart-readout"]');
    expect(heightUtilitiesOf(readout?.parentElement ?? null)).toEqual(skeletonClasses);
  });

  it("re-issues the history read when refreshTick changes while expanded", async () => {
    const fixture = render(true);
    await flushBuckets(fixture, makeBuckets());

    fixture.componentRef.setInput("refreshTick", 1);
    fixture.detectChanges();

    await flushBuckets(fixture, makeBuckets());
  });

  it("ignores refreshTick changes while collapsed", () => {
    const fixture = render(false);

    fixture.componentRef.setInput("refreshTick", 1);
    fixture.detectChanges();

    expect(httpMock.match(() => true)).toHaveLength(0);
  });

  it("shows the shared retry banner when the history read fails", async () => {
    const fixture = render(true);

    const request = httpMock.expectOne((r) => r.body.query.includes("LineStatusHistory"));
    request.flush({ errors: [{ message: "boom" }] });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.directive(RetryBannerComponent))).not.toBeNull();
  });
});
