import { provideZonelessChangeDetection } from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RetryBannerComponent } from "../../../ui/retry-banner/retry-banner.component";
import { LineStatusReportItem } from "../data/home.queries";
import { LineStatusReportsComponent } from "./line-status-reports.component";

function makeReports(): LineStatusReportItem[] {
  return [
    {
      id: "r1",
      status: "CROWDED",
      delayMinutes: 12,
      notes: "Packed at KLCC.",
      created: new Date().toISOString(),
      user: { shortId: "u1", nickname: "Aina" },
    },
    {
      id: "r2",
      status: "NORMAL",
      delayMinutes: null,
      notes: "",
      created: new Date().toISOString(),
      user: null,
    },
  ];
}

describe("LineStatusReportsComponent", () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LineStatusReportsComponent],
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
  ): ComponentFixture<LineStatusReportsComponent> {
    const fixture = TestBed.createComponent(LineStatusReportsComponent);
    fixture.componentRef.setInput("lineId", lineId);
    fixture.componentRef.setInput("expanded", expanded);
    fixture.detectChanges();
    return fixture;
  }

  async function flushReports(
    fixture: ComponentFixture<LineStatusReportsComponent>,
    reports: LineStatusReportItem[],
  ): Promise<void> {
    const request = httpMock.expectOne((r) => r.body.query.includes("LineStatusReports"));
    request.flush({
      data: {
        lineStatusReports: {
          edges: reports.map((node, index) => ({ node, cursor: `c${index}` })),
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    });
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it("renders nothing and fetches nothing until expanded", () => {
    const fixture = render(false);
    const root = fixture.nativeElement as HTMLElement;

    expect(httpMock.match(() => true)).toHaveLength(0);
    expect(root.querySelector('[data-testid="line-status-reports"]')).toBeNull();
  });

  it("reads the first page of reports once expanded", async () => {
    const fixture = render(true, "line-3");

    const request = httpMock.expectOne((r) => r.body.query.includes("LineStatusReports"));
    expect(request.request.body.variables).toEqual({ lineId: "line-3", first: 10 });

    request.flush({
      data: {
        lineStatusReports: {
          edges: makeReports().map((node, index) => ({ node, cursor: `c${index}` })),
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const rows = [...root.querySelectorAll<HTMLElement>('[data-testid="line-status-report"]')];

    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain("Crowded");
    expect(rows[0]?.textContent).toContain("today");
    expect(rows[0]?.querySelector('[data-testid="report-delay"]')?.textContent).toContain(
      "12 min delay",
    );
    expect(rows[0]?.querySelector('[data-testid="report-notes"]')?.textContent).toContain(
      "Packed at KLCC.",
    );
    expect(rows[1]?.querySelector('[data-testid="report-delay"]')).toBeNull();
    expect(rows[1]?.querySelector('[data-testid="report-notes"]')).toBeNull();
  });

  it("shows an empty state when the line has no reports", async () => {
    const fixture = render(true);
    await flushReports(fixture, []);

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="line-status-reports-empty"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="line-status-report"]')).toBeNull();
  });

  it("shows the shared retry banner when the reports read fails", async () => {
    const fixture = render(true);

    const request = httpMock.expectOne((r) => r.body.query.includes("LineStatusReports"));
    request.flush({ errors: [{ message: "boom" }] });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.directive(RetryBannerComponent))).not.toBeNull();
  });
});
