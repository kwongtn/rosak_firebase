import { provideZonelessChangeDetection } from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RetryBannerComponent } from "../../../ui/retry-banner/retry-banner.component";
import { LineStatusHourBucket } from "../data/home.queries";
import { LineStatusChartComponent } from "./line-status-chart.component";

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

  it("shows the shared retry banner when the history read fails", async () => {
    const fixture = render(true);

    const request = httpMock.expectOne((r) => r.body.query.includes("LineStatusHistory"));
    request.flush({ errors: [{ message: "boom" }] });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.directive(RetryBannerComponent))).not.toBeNull();
  });
});
