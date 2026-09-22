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
    },
    {
      hourStart: "2026-09-21T20:00:00+00:00",
      hourEnd: "2026-09-21T21:00:00+00:00",
      count: 0,
      dominantStatus: null,
    },
    {
      hourStart: "2026-09-21T21:00:00+00:00",
      hourEnd: "2026-09-21T22:00:00+00:00",
      count: 2,
      dominantStatus: "DELAYED",
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
  return SERVICE_DAY_HOURS.map((_, index) => ({
    hourStart: new Date(Date.UTC(2026, 8, 21, 19 + index)).toISOString(),
    hourEnd: new Date(Date.UTC(2026, 8, 21, 20 + index)).toISOString(),
    count: index % 4,
    dominantStatus: index % 4 === 0 ? null : "BUSY",
  }));
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

  it("scales each bar to the busiest hour and labels hour, count and dominant status", async () => {
    const fixture = render(true);
    await flushBuckets(fixture, makeBuckets());

    const root = fixture.nativeElement as HTMLElement;
    const bars = [...root.querySelectorAll<HTMLElement>('[data-testid="line-status-bar"]')];

    expect(bars[0]?.dataset["hour"]).toBe("03");
    expect(bars[0]?.getAttribute("title")).toBe("03:00–04:00 · 4 reports · Crowded");
    expect(bars[2]?.getAttribute("title")).toBe("05:00–06:00 · 2 reports · Delayed");

    const tallest = bars[0]?.querySelector<HTMLElement>("div");
    const half = bars[2]?.querySelector<HTMLElement>("div");
    const empty = bars[1]?.querySelector<HTMLElement>("div");
    expect(tallest?.style.height).toBe("100%");
    expect(half?.style.height).toBe("50%");
    expect(empty?.style.height).toBe("0%");

    expect(root.querySelector('[data-testid="line-status-chart"]')?.textContent).toContain("03");
  });

  it("shows an empty state when the service day has no reports", async () => {
    const fixture = render(true);
    await flushBuckets(
      fixture,
      makeBuckets().map((bucket) => ({ ...bucket, count: 0, dominantStatus: null })),
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
  });

  it("reserves the same height for the loading skeleton and the no-data state", async () => {
    const fixture = render(true);
    const root = fixture.nativeElement as HTMLElement;

    const skeleton = root.querySelector('[data-testid="line-status-chart-skeleton"]');
    expect(skeleton).not.toBeNull();
    expect(heightUtilitiesOf(skeleton)).toContain(CHART_STATE_MIN_HEIGHT_CLASS);

    await flushBuckets(
      fixture,
      makeBuckets().map((bucket) => ({ ...bucket, count: 0, dominantStatus: null })),
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

  it("shows the shared retry banner when the history read fails", async () => {
    const fixture = render(true);

    const request = httpMock.expectOne((r) => r.body.query.includes("LineStatusHistory"));
    request.flush({ errors: [{ message: "boom" }] });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.directive(RetryBannerComponent))).not.toBeNull();
  });
});
