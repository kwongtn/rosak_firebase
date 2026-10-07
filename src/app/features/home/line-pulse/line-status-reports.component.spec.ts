import { provideZonelessChangeDetection } from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RetryBannerComponent } from "../../../ui/retry-banner/retry-banner.component";
import { LineStatusReportItem } from "../data/home-history.queries";
import { LineStatusReportsComponent } from "./line-status-reports.component";

/** One report row. `stations` defaults to none so a strip spec can be explicit about its own. */
function report(
  id: string,
  stations: LineStatusReportItem["stations"] = [],
  overrides: Partial<LineStatusReportItem> = {},
): LineStatusReportItem {
  return {
    id,
    status: "CROWDED",
    delayMinutes: null,
    notes: "",
    created: new Date().toISOString(),
    stations,
    user: null,
    ...overrides,
  };
}

function makeReports(): LineStatusReportItem[] {
  return [
    {
      id: "r1",
      status: "CROWDED",
      delayMinutes: 12,
      notes: "Packed at KLCC.",
      created: new Date().toISOString(),
      stations: [{ id: "st1", displayName: "KLCC" }],
      user: { shortId: "u1", nickname: "Aina" },
    },
    {
      id: "r2",
      status: "NORMAL",
      delayMinutes: null,
      notes: "",
      created: new Date().toISOString(),
      stations: [],
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
    expect(rows[0]?.textContent).toContain("less than a minute ago");
    expect(rows[0]?.querySelector('[data-testid="report-delay"]')?.textContent).toContain(
      "12 min delay",
    );
    expect(rows[0]?.querySelector('[data-testid="report-notes"]')?.textContent).toContain(
      "Packed at KLCC.",
    );
    expect(rows[1]?.querySelector('[data-testid="report-delay"]')).toBeNull();
    expect(rows[1]?.querySelector('[data-testid="report-notes"]')).toBeNull();
  });

  it("renders the related stations joined by name when present", async () => {
    const fixture = render(true);
    await flushReports(fixture, [
      {
        id: "r-stations",
        status: "CROWDED",
        delayMinutes: null,
        notes: "",
        created: new Date().toISOString(),
        stations: [
          { id: "s1", displayName: "KLCC" },
          { id: "s2", displayName: "Masjid Jamek" },
        ],
        user: null,
      },
    ]);

    const root = fixture.nativeElement as HTMLElement;
    const station = root.querySelector<HTMLElement>('[data-testid="report-station"]');
    expect(station?.textContent).toContain("KLCC, Masjid Jamek");
    expect(station?.getAttribute("title")).toBe("KLCC, Masjid Jamek");
  });

  it("omits the station when a report has none", async () => {
    const fixture = render(true);
    await flushReports(fixture, makeReports());

    const root = fixture.nativeElement as HTMLElement;
    const rows = [...root.querySelectorAll<HTMLElement>('[data-testid="line-status-report"]')];

    expect(rows).toHaveLength(2);
    expect(rows[0]?.querySelector('[data-testid="report-station"]')?.textContent).toContain("KLCC");
    expect(rows[1]?.querySelector('[data-testid="report-station"]')).toBeNull();
  });

  it("shows the relative time with a hover title carrying the formatted timestamp", async () => {
    const created = new Date();
    const fixture = render(true);
    await flushReports(fixture, [
      {
        id: "r-time",
        status: "NORMAL",
        delayMinutes: null,
        notes: "",
        created: created.toISOString(),
        stations: [],
        user: null,
      },
    ]);

    const root = fixture.nativeElement as HTMLElement;
    const time = root.querySelector<HTMLElement>('[data-testid="report-time"]');

    expect(time?.textContent).toContain("less than a minute ago");
    const title = time?.getAttribute("title") ?? "";
    expect(title).not.toBe(created.toISOString());
    expect(title).toMatch(/^Reported \w{3} \d{1,2}, \d{4} \d{2}:\d{2}$/);
  });

  it("keeps the station and the time in the same row", async () => {
    const fixture = render(true);
    await flushReports(fixture, makeReports());

    const root = fixture.nativeElement as HTMLElement;
    const row = root.querySelector<HTMLElement>('[data-testid="line-status-report"]');

    expect(row?.querySelector('[data-testid="report-station"]')?.textContent).toContain("KLCC");
    const time = row?.querySelector<HTMLElement>('[data-testid="report-time"]');
    expect(time).not.toBeNull();
    expect(time?.textContent?.trim()).not.toBe("");
    expect(row?.textContent).toContain("less than a minute ago");
  });

  it("shows an empty state when the line has no reports", async () => {
    const fixture = render(true);
    await flushReports(fixture, []);

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="line-status-reports-empty"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="line-status-report"]')).toBeNull();
  });

  it("caps the loaded list in its own scroll container", async () => {
    const fixture = render(true);
    await flushReports(fixture, makeReports());

    const root = fixture.nativeElement as HTMLElement;
    const scroll = root.querySelector<HTMLElement>('[data-testid="line-status-reports-scroll"]');

    expect(scroll).not.toBeNull();
    expect(scroll?.classList.contains("max-h-56")).toBe(true);
    expect(scroll?.classList.contains("overflow-y-auto")).toBe(true);
    expect(scroll?.querySelectorAll('[data-testid="line-status-report"]')).toHaveLength(2);
  });

  it("does not render the scroll container for the skeleton or empty states", async () => {
    const fixture = render(true);

    const root = fixture.nativeElement as HTMLElement;
    // The read is still in flight, so the skeleton branch is showing.
    expect(root.querySelector('[data-testid="line-status-reports-scroll"]')).toBeNull();

    await flushReports(fixture, []);
    expect(root.querySelector('[data-testid="line-status-reports-empty"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="line-status-reports-scroll"]')).toBeNull();
  });

  it("re-issues the reports read when refreshTick changes while expanded", async () => {
    const fixture = render(true);
    await flushReports(fixture, makeReports());

    fixture.componentRef.setInput("refreshTick", 1);
    fixture.detectChanges();

    await flushReports(fixture, makeReports());
  });

  it("ignores refreshTick changes while collapsed", async () => {
    const fixture = render(false);

    fixture.componentRef.setInput("refreshTick", 1);
    fixture.detectChanges();

    expect(httpMock.match(() => true)).toHaveLength(0);
  });

  it("shows the shared retry banner when the reports read fails", async () => {
    const fixture = render(true);

    const request = httpMock.expectOne((r) => r.body.query.includes("LineStatusReports"));
    request.flush({ errors: [{ message: "boom" }] });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.directive(RetryBannerComponent))).not.toBeNull();
  });

  /* ---- the per-station strip ------------------------------------------------------- */

  it("tallies the loaded reports by station above the list, busiest first", async () => {
    const fixture = render(true);
    await flushReports(fixture, [
      report("r1", [{ id: "s1", displayName: "KLCC" }]),
      report("r2", [{ id: "s2", displayName: "Masjid Jamek" }]),
      report("r3", [{ id: "s1", displayName: "KLCC" }]),
      report("r4", [{ id: "s3", displayName: "Bukit Jalil" }]),
      report("r5", [
        { id: "s1", displayName: "KLCC" },
        { id: "s4", displayName: "Sri Petaling" },
      ]),
    ]);

    const root = fixture.nativeElement as HTMLElement;
    const strip = root.querySelector<HTMLElement>('[data-testid="station-strip"]');
    expect(strip).not.toBeNull();
    const chips = [...(strip as HTMLElement).querySelectorAll('[data-slot="badge"]')].map(
      (chip) => chip.textContent?.replace(/\s+/g, " ").trim() ?? "",
    );
    // KLCC 3, then the single-report stations by name so the strip is stable between reads.
    expect(chips).toEqual(["KLCC 3", "Bukit Jalil 1", "Masjid Jamek 1", "Sri Petaling 1"]);
    // It answers WHERE, which the list itself cannot at a glance — so it sits above the list.
    expect(
      (strip as HTMLElement).compareDocumentPosition(
        root.querySelector('[data-testid="line-status-reports-scroll"]') as Node,
      ),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("groups two station rows sharing a display name into one chip", async () => {
    const fixture = render(true);
    await flushReports(fixture, [
      report("r1", [{ id: "s1", displayName: "KLCC" }]),
      report("r2", [{ id: "s2", displayName: "KLCC" }]),
    ]);

    const root = fixture.nativeElement as HTMLElement;
    // Display name is what the reader sees in the rows and what the chip prints, so two rows with
    // the same name are one place as far as this surface is concerned.
    const chips = [...root.querySelectorAll('[data-testid="station-strip"] [data-slot="badge"]')];
    expect(chips).toHaveLength(1);
    expect(chips[0]?.textContent?.replace(/\s+/g, " ").trim()).toBe("KLCC 2");
  });

  it("hides the strip entirely when no loaded report names a station", async () => {
    const fixture = render(true);
    await flushReports(fixture, [report("r1"), report("r2", [])]);

    // A strip reading "0 reports · · ·" would be worse than no strip: it would look like the page
    // had station data and there was none.
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="station-strip"]')).toBeNull();
    expect(root.querySelectorAll('[data-testid="line-status-report"]')).toHaveLength(2);
  });

  it("shows no strip for an empty report list", async () => {
    const fixture = render(true);
    await flushReports(fixture, []);

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="station-strip"]')).toBeNull();
    expect(root.querySelector('[data-testid="line-status-reports-empty"]')).not.toBeNull();
  });
});
