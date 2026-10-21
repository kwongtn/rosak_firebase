import { provideZonelessChangeDetection } from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { metricTooltip } from "../../../core/methodology/methodology-render.util";
import {
  INSIDEN_MONTHLY_HISTORY_QUERY,
  type InsidenMonthlyHistoryData,
  type MonthlyHistoryIncident,
} from "../data/insiden-history.queries";
import { IncidentHistoryComponent } from "./incident-history.component";

function incident(
  id: string,
  startDatetime: string,
  severity: MonthlyHistoryIncident["severity"],
  status = "LIVE",
): MonthlyHistoryIncident {
  return { id, startDatetime, severity, status };
}

/**
 * A window ending 2026-03 (so 2025-04 .. 2026-03): the two year reads overlap on incident 4, one
 * incident is outside the window, one is a draft, and one is of "other" severity.
 */
function marchWindowData(): InsidenMonthlyHistoryData {
  const december = incident("4", "2025-12-30T08:00:00", "MINOR");
  return {
    startYearIncidents: [
      incident("1", "2025-04-10T08:00:00", "MAJOR"),
      incident("2", "2025-04-11T08:00:00", "MINOR"),
      incident("3", "2025-03-31T23:00:00", "MAJOR"), // before the window
      december,
    ],
    endYearIncidents: [
      { ...december },
      incident("5", "2026-03-02T08:00:00", "MAJOR"),
      incident("6", "2026-01-02T08:00:00", "OTHERS"),
      incident("7", "2026-02-02T08:00:00", "MAJOR", "DRAFT"),
    ],
  };
}

describe("IncidentHistoryComponent", () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IncidentHistoryComponent],
      providers: [provideZonelessChangeDetection(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
    httpMock.verify();
  });

  const isHistoryRead = (request: { body?: { query?: string } | null }): boolean =>
    request.body?.query === INSIDEN_MONTHLY_HISTORY_QUERY;

  function mount(endMonth: string): ComponentFixture<IncidentHistoryComponent> {
    const fixture = TestBed.createComponent(IncidentHistoryComponent);
    fixture.componentRef.setInput("endMonth", endMonth);
    fixture.detectChanges();
    return fixture;
  }

  function root(fixture: ComponentFixture<IncidentHistoryComponent>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function byTestId(fixture: ComponentFixture<IncidentHistoryComponent>, id: string): HTMLElement {
    const el = root(fixture).querySelector<HTMLElement>(`[data-testid="${id}"]`);
    if (!el) {
      throw new Error(`no [data-testid="${id}"]`);
    }
    return el;
  }

  function open(fixture: ComponentFixture<IncidentHistoryComponent>): void {
    byTestId(fixture, "incident-history-toggle").click();
    fixture.detectChanges();
  }

  async function answer(
    fixture: ComponentFixture<IncidentHistoryComponent>,
    data: InsidenMonthlyHistoryData,
  ): Promise<void> {
    httpMock.expectOne(isHistoryRead).flush({ data });
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function openAndAnswer(
    endMonth = "2026-03",
    data: InsidenMonthlyHistoryData = marchWindowData(),
  ): Promise<ComponentFixture<IncidentHistoryComponent>> {
    const fixture = mount(endMonth);
    open(fixture);
    await answer(fixture, data);
    return fixture;
  }

  function bars(fixture: ComponentFixture<IncidentHistoryComponent>): HTMLElement[] {
    return [...root(fixture).querySelectorAll<HTMLElement>('[data-testid="incident-history-bar"]')];
  }

  function segmentHeights(bar: HTMLElement | undefined, severity: string): number | null {
    const segment = bar?.querySelector<HTMLElement>(`[data-severity="${severity}"]`);
    return segment ? Number.parseFloat(segment.style.height) : null;
  }

  describe("laziness", () => {
    it("renders collapsed and issues no request until the section is opened", () => {
      const fixture = mount("2026-03");

      expect(httpMock.match(() => true)).toHaveLength(0);
      expect(root(fixture).querySelector('[data-testid="incident-history-body"]')).toBeNull();
      expect(byTestId(fixture, "incident-history-toggle").getAttribute("aria-expanded")).toBe(
        "false",
      );
    });

    it("reads the window once opened, and not before", () => {
      const fixture = mount("2026-03");
      open(fixture);

      expect(httpMock.match(isHistoryRead)).toHaveLength(1);
      expect(byTestId(fixture, "incident-history-toggle").getAttribute("aria-expanded")).toBe(
        "true",
      );
      expect(byTestId(fixture, "incident-history-skeleton")).toBeTruthy();
    });

    it("keeps the title a real heading whose button owns the toggle", () => {
      const fixture = mount("2026-03");

      expect(byTestId(fixture, "incident-history-toggle").closest("h2")).not.toBeNull();
      expect(byTestId(fixture, "incident-history-toggle").textContent).toContain("Last 12 months");
    });
  });

  describe("request variables (hydration rule)", () => {
    it("derives the two year filters from endMonth", () => {
      const fixture = mount("2026-03");
      open(fixture);

      const request = httpMock.expectOne(isHistoryRead);
      expect(request.request.body.variables).toEqual({
        startYear: { date: { year: { exact: 2025 } } },
        endYear: { date: { year: { exact: 2026 } } },
        sameYear: false,
      });
      request.flush({ data: { startYearIncidents: [], endYearIncidents: [] } });
    });

    it("asks for one year once, not twice, when the window ends in December", () => {
      const fixture = mount("2026-12");
      open(fixture);

      // January..December 2026 sits inside 2026: the second aliased read would repeat the first, so
      // `$sameYear` has the server skip it (the payload grows with every ongoing incident).
      const request = httpMock.expectOne(isHistoryRead);
      expect(request.request.body.variables).toEqual({
        startYear: { date: { year: { exact: 2026 } } },
        endYear: { date: { year: { exact: 2026 } } },
        sameYear: true,
      });
      expect(request.request.body.query).toContain("@skip(if: $sameYear)");
      request.flush({ data: { startYearIncidents: [] } });
    });

    it("draws a December window from the one read the server answers", async () => {
      const fixture = await openAndAnswer("2026-12", {
        startYearIncidents: [
          incident("a", "2026-01-10T08:00:00", "MAJOR"),
          incident("b", "2026-12-02T08:00:00", "MINOR"),
        ],
      });

      const byMonth = new Map(bars(fixture).map((bar) => [bar.dataset["month"], bar]));
      expect(bars(fixture)).toHaveLength(12);
      expect(byMonth.get("2026-01")?.getAttribute("title")).toBe(
        "January 2026 · 1 incident · Major 1, Minor 0",
      );
      expect(byMonth.get("2026-12")?.getAttribute("title")).toBe(
        "December 2026 · 1 incident · Major 0, Minor 1",
      );
    });

    it("does not depend on the clock: the same endMonth sends the same body on any day", () => {
      // The server and the browser must ask the same question. A clock-derived window would differ
      // across a month rollover between the server render and hydration.
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2031-07-15T00:00:00Z"));
      const first = mount("2026-03");
      open(first);
      const early = httpMock.expectOne(isHistoryRead);
      const earlyVariables = early.request.body.variables;
      early.flush({ data: { startYearIncidents: [], endYearIncidents: [] } });

      vi.setSystemTime(new Date("2019-01-01T00:00:00Z"));
      const second = mount("2026-03");
      open(second);
      const late = httpMock.expectOne(isHistoryRead);

      expect(late.request.body.variables).toEqual(earlyVariables);
      late.flush({ data: { startYearIncidents: [], endYearIncidents: [] } });
    });

    it("reads again, with new variables, when the month changes", async () => {
      const fixture = await openAndAnswer("2026-03");

      fixture.componentRef.setInput("endMonth", "2025-02");
      fixture.detectChanges();

      const request = httpMock.expectOne(isHistoryRead);
      expect(request.request.body.variables).toEqual({
        startYear: { date: { year: { exact: 2024 } } },
        endYear: { date: { year: { exact: 2025 } } },
        sameYear: false,
      });
      request.flush({ data: { startYearIncidents: [], endYearIncidents: [] } });
    });

    it("does not read again for another month in the same pair of calendar years: it re-buckets", async () => {
      // 2026-03 and 2026-06 both span 2025 and 2026, so the two year reads already hold every month
      // of both windows. `httpResource` re-reads on any NEW request object, so this pins that the
      // request function only re-runs when the pair of years changes.
      const fixture = await openAndAnswer("2026-03");
      expect(bars(fixture)[0]?.dataset["month"]).toBe("2025-04");

      fixture.componentRef.setInput("endMonth", "2026-06");
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(httpMock.match(isHistoryRead)).toHaveLength(0);
      expect(bars(fixture)[0]?.dataset["month"]).toBe("2025-07");
      expect(bars(fixture)[11]?.dataset["month"]).toBe("2026-06");
      // The loaded incidents are re-counted for the new window, not discarded: March 2026 is still
      // in it and still carries its major incident.
      const march = bars(fixture).find((bar) => bar.dataset["month"] === "2026-03");
      expect(march?.getAttribute("title")).toBe("March 2026 · 1 incident · Major 1, Minor 0");
    });

    it("asks nothing for a malformed month, and says what to do instead", () => {
      const fixture = mount("foo");
      open(fixture);

      expect(httpMock.match(() => true)).toHaveLength(0);
      expect(byTestId(fixture, "incident-history-invalid").textContent).toContain("Pick a month");
    });
  });

  describe("the chart", () => {
    it("draws one bar per month of the window, oldest first", async () => {
      const fixture = await openAndAnswer();
      const months = bars(fixture).map((bar) => bar.dataset["month"]);

      expect(months).toHaveLength(12);
      expect(months[0]).toBe("2025-04");
      expect(months[11]).toBe("2026-03");
    });

    it("counts approved incidents by start month, once, and ignores drafts and strays", async () => {
      const fixture = await openAndAnswer();
      const byMonth = new Map(bars(fixture).map((bar) => [bar.dataset["month"], bar]));

      // April 2025: 1 major + 1 minor. December 2025: the incident returned by BOTH reads, once.
      expect(byMonth.get("2025-04")?.getAttribute("title")).toBe(
        "April 2025 · 2 incidents · Major 1, Minor 1",
      );
      expect(byMonth.get("2025-12")?.getAttribute("title")).toBe(
        "December 2025 · 1 incident · Major 0, Minor 1",
      );
      expect(byMonth.get("2026-03")?.getAttribute("title")).toBe(
        "March 2026 · 1 incident · Major 1, Minor 0",
      );
      // The draft in February and the other-severity incident in January do not draw.
      expect(byMonth.get("2026-02")?.getAttribute("title")).toBe("February 2026 · No incidents");
      expect(byMonth.get("2026-01")?.getAttribute("title")).toBe("January 2026 · No incidents");
    });

    it("stacks major under minor and sizes each segment by its share of the bar", async () => {
      const fixture = await openAndAnswer();
      const april = bars(fixture).find((bar) => bar.dataset["month"] === "2025-04");

      expect(april?.className).toContain("flex-col-reverse");
      // The busiest month (April, 2 incidents) is full height, split in half.
      expect(segmentHeights(april, "major")).toBeCloseTo(50);
      expect(segmentHeights(april, "minor")).toBeCloseTo(50);
      const segments = [...(april?.querySelectorAll<HTMLElement>("[data-severity]") ?? [])];
      // DOM order is bottom-up under flex-col-reverse: major first, so it sits at the base.
      expect(segments.map((segment) => segment.dataset["severity"])).toEqual(["major", "minor"]);
      expect(segments[0]?.className).toContain("bg-destructive");
      expect(segments[1]?.className).toContain("bg-amber-500");
    });

    it("scales a quieter month against the busiest and draws an empty month as nothing", async () => {
      const fixture = await openAndAnswer();
      const december = bars(fixture).find((bar) => bar.dataset["month"] === "2025-12");
      const january = bars(fixture).find((bar) => bar.dataset["month"] === "2026-01");

      expect(segmentHeights(december, "minor")).toBeCloseTo(50);
      expect(segmentHeights(december, "major")).toBeNull();
      expect(january?.querySelectorAll("[data-severity]")).toHaveLength(0);
    });

    it("labels the axis with months and the year on the first column and each January", async () => {
      const fixture = await openAndAnswer();
      const ticks = [
        ...root(fixture).querySelectorAll<HTMLElement>('[data-testid="incident-history-tick"]'),
      ].map((tick) => (tick.textContent ?? "").replace(/\s+/g, " ").trim());

      expect(ticks[0]).toBe("Apr 2025");
      expect(ticks[1]).toBe("May");
      expect(ticks[9]).toBe("Jan 2026");
      expect(ticks[11]).toBe("Mar");
    });

    it("scales the y axis to the busiest month: its count, half of it, and zero", async () => {
      const fixture = await openAndAnswer();
      const labels = [...byTestId(fixture, "incident-history-axis").querySelectorAll("span")].map(
        (label) => label.textContent?.trim(),
      );

      expect(labels).toEqual(["2", "1", "0"]);
    });

    it("names the window beside the legend", async () => {
      const fixture = await openAndAnswer();

      expect(byTestId(fixture, "incident-history-range").textContent).toContain(
        "April 2025 – March 2026",
      );
      expect(byTestId(fixture, "incident-history-legend").textContent).toContain("Major");
      expect(byTestId(fixture, "incident-history-legend").textContent).toContain("Minor");
    });

    it("says how many approved incidents of other severity are not drawn", async () => {
      const fixture = await openAndAnswer();

      expect(byTestId(fixture, "incident-history-other").textContent).toContain(
        "1 approved incident of other severity is not shown.",
      );
    });

    it("omits that note when there are none", async () => {
      const data = marchWindowData();
      data.endYearIncidents = (data.endYearIncidents ?? []).filter(
        (entry) => entry.severity !== "OTHERS",
      );
      const fixture = await openAndAnswer("2026-03", data);

      expect(root(fixture).querySelector('[data-testid="incident-history-other"]')).toBeNull();
    });

    it("shows a bar's detail in the readout on hover and on tap", async () => {
      const fixture = await openAndAnswer();
      const april = bars(fixture).find((bar) => bar.dataset["month"] === "2025-04");

      expect(byTestId(fixture, "incident-history-readout").textContent).toContain("Hover or tap");
      april?.dispatchEvent(new Event("mouseenter"));
      fixture.detectChanges();
      const readout = byTestId(fixture, "incident-history-readout").textContent ?? "";
      expect(readout).toContain("April 2025");
      expect(readout).toContain("2 incidents");
      expect(readout).toContain("Major 1");
      expect(readout).toContain("Minor 1");

      byTestId(fixture, "incident-history-chart").dispatchEvent(new Event("mouseleave"));
      fixture.detectChanges();
      expect(byTestId(fixture, "incident-history-readout").textContent).toContain("Hover or tap");

      const december = bars(fixture).find((bar) => bar.dataset["month"] === "2025-12");
      december?.click();
      fixture.detectChanges();
      expect(byTestId(fixture, "incident-history-readout").textContent).toContain("December 2025");
    });

    it("clears the readout when the window changes, rather than naming a bar that is gone", async () => {
      const fixture = await openAndAnswer();
      bars(fixture)[0]?.dispatchEvent(new Event("mouseenter"));
      fixture.detectChanges();

      // Same pair of calendar years, so no new read: the bars are re-counted from what is loaded.
      fixture.componentRef.setInput("endMonth", "2026-04");
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(byTestId(fixture, "incident-history-readout").textContent).toContain("Hover or tap");
    });
  });

  describe("accessibility", () => {
    it("gives the bars one role=img sentence and hides each bar from assistive tech", async () => {
      const fixture = await openAndAnswer();
      const chart = byTestId(fixture, "incident-history-chart");

      expect(chart.getAttribute("role")).toBe("img");
      expect(chart.getAttribute("aria-label")).toBe(
        "Incidents started per month, April 2025 to March 2026: 2 major and 2 minor. Busiest month: April 2025 with 2 incidents",
      );
      for (const bar of bars(fixture)) {
        expect(bar.getAttribute("aria-hidden")).toBe("true");
      }
    });

    it("offers the same numbers as a table: month, major, minor", async () => {
      const fixture = await openAndAnswer();
      const table = byTestId(fixture, "incident-history-table");
      const headers = [...table.querySelectorAll("thead th")].map((th) => th.textContent?.trim());
      const rows = [
        ...root(fixture).querySelectorAll<HTMLElement>('[data-testid="incident-history-row"]'),
      ];
      const cells = (row: HTMLElement | undefined): string[] =>
        [...(row?.querySelectorAll("th, td") ?? [])].map((cell) => (cell.textContent ?? "").trim());

      expect(headers).toEqual(["Month", "Major", "Minor"]);
      expect(rows).toHaveLength(12);
      expect(cells(rows[0])).toEqual(["April 2025", "1", "1"]);
      expect(cells(rows[8])).toEqual(["December 2025", "0", "1"]);
      expect(cells(rows[11])).toEqual(["March 2026", "1", "0"]);
      expect(table.querySelector("caption")?.textContent).toContain("by severity");
      expect(table.querySelector('th[scope="row"]')).not.toBeNull();
    });

    it("keeps the table inside a disclosure so it does not crowd the chart", async () => {
      const fixture = await openAndAnswer();

      const details = byTestId(fixture, "incident-history-table-details") as HTMLDetailsElement;
      expect(details.tagName).toBe("DETAILS");
      expect(details.open).toBe(false);
      expect(details.querySelector("summary")?.textContent).toContain("View as table");
    });
  });

  describe("states", () => {
    it("says so when no approved incident started in the window", async () => {
      const fixture = await openAndAnswer("2026-03", {
        startYearIncidents: [incident("d", "2026-01-05T08:00:00", "MAJOR", "PENDING_APPROVAL")],
        endYearIncidents: [],
      });

      expect(byTestId(fixture, "incident-history-empty").textContent).toContain(
        "No approved Major or Minor incidents started in the 12 months to March 2026.",
      );
      expect(root(fixture).querySelector('[data-testid="incident-history-chart"]')).toBeNull();
    });

    it("shows the retry banner when the read fails", async () => {
      const fixture = mount("2026-03");
      open(fixture);

      httpMock.expectOne(isHistoryRead).flush("boom", { status: 500, statusText: "Server Error" });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(root(fixture).querySelector("app-retry-banner")).not.toBeNull();
      expect(root(fixture).textContent).toContain("Couldn't load the incident history.");
    });

    it("shows a skeleton, not the empty message, while another month's window loads", async () => {
      const fixture = await openAndAnswer("2026-03");

      fixture.componentRef.setInput("endMonth", "2025-02");
      fixture.detectChanges();

      expect(byTestId(fixture, "incident-history-skeleton")).toBeTruthy();
      expect(root(fixture).querySelector('[data-testid="incident-history-empty"]')).toBeNull();
      httpMock
        .expectOne(isHistoryRead)
        .flush({ data: { startYearIncidents: [], endYearIncidents: [] } });
    });

    it("collapses again without issuing another request", async () => {
      const fixture = await openAndAnswer();

      byTestId(fixture, "incident-history-toggle").click();
      fixture.detectChanges();

      expect(root(fixture).querySelector('[data-testid="incident-history-body"]')).toBeNull();
      expect(httpMock.match(() => true)).toHaveLength(0);
    });
  });

  describe("the definition", () => {
    it("surfaces the registry's tooltip copy and links to the owning methodology section", async () => {
      const fixture = mount("2026-03");

      const trigger = root(fixture).querySelector<HTMLButtonElement>(
        'button[aria-label="What is Incidents per month by severity?"]',
      );
      expect(trigger).not.toBeNull();
      trigger?.click();
      fixture.detectChanges();

      const panel = byTestId(fixture, "incident-history-popover");
      expect(panel.textContent).toContain("Incidents per month by severity");
      expect(panel.textContent).toContain(metricTooltip("incidents.monthly-by-severity"));
      expect(panel.querySelector("a")?.getAttribute("href")).toBe("/methodology#episodes");
    });
  });
});
