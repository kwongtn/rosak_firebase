import { provideZonelessChangeDetection } from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { metricTooltip } from "../../../core/methodology/methodology-render.util";
import { RetryBannerComponent } from "../../../ui/retry-banner/retry-banner.component";
import type { LineStatusWeekBucket } from "../data/home-history.queries";
import { PASSENGER_BAR_CLASS, PASSENGER_NO_DATA_BAR_CLASS } from "../data/passenger-status.util";
import { SERVICE_DAY_START_HOUR } from "../data/status-history-display.util";
import { MIN_REPORTS_PER_WEEK_SLOT, WEEK_PROFILE_WEEKS } from "../data/week-profile-display.util";
import {
  LineWeekProfileComponent,
  WEEK_STATE_MIN_HEIGHT_CLASS,
} from "./line-week-profile.component";

function slot(
  weekday: number,
  hour: number,
  count: number,
  overrides: Partial<LineStatusWeekBucket> = {},
): LineStatusWeekBucket {
  return {
    weekday,
    hour,
    count,
    dominantStatus: count > 0 ? "CROWDED" : null,
    statusCounts: count > 0 ? [{ status: "CROWDED", count }] : [],
    ...overrides,
  };
}

/** All 168 slots in the backend's order (Monday first, hours from 03), empty unless `filled` has them. */
function fullWeek(filled: LineStatusWeekBucket[] = []): LineStatusWeekBucket[] {
  const byKey = new Map(filled.map((entry) => [`${entry.weekday}:${entry.hour}`, entry]));
  const slots: LineStatusWeekBucket[] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    for (let index = 0; index < 24; index++) {
      const hour = (SERVICE_DAY_START_HOUR + index) % 24;
      slots.push(byKey.get(`${weekday}:${hour}`) ?? slot(weekday, hour, 0));
    }
  }
  return slots;
}

/** A week with a busy Thursday afternoon, a thin Thursday morning and a one-report Friday. */
function sampleWeek(): LineStatusWeekBucket[] {
  return fullWeek([
    slot(3, 15, 9),
    slot(3, 16, 5, {
      dominantStatus: "DISRUPTED",
      statusCounts: [
        { status: "CROWDED", count: 2 },
        { status: "DISRUPTED", count: 3 },
      ],
    }),
    slot(3, 8, MIN_REPORTS_PER_WEEK_SLOT - 1),
    slot(4, 9, 1),
  ]);
}

describe("LineWeekProfileComponent", () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LineWeekProfileComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClientTesting(),
        // The info popover's "How this works" link is a routerLink.
        provideRouter([]),
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function render(lineId = "line-1"): ComponentFixture<LineWeekProfileComponent> {
    const fixture = TestBed.createComponent(LineWeekProfileComponent);
    fixture.componentRef.setInput("lineId", lineId);
    fixture.detectChanges();
    return fixture;
  }

  async function flushWeek(
    fixture: ComponentFixture<LineWeekProfileComponent>,
    slots: LineStatusWeekBucket[],
  ): Promise<void> {
    const request = httpMock.expectOne((r) => r.body.query.includes("LineStatusWeekProfile"));
    request.flush({ data: { lineStatusWeekProfile: slots } });
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function root(fixture: ComponentFixture<LineWeekProfileComponent>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function byTestId(
    fixture: ComponentFixture<LineWeekProfileComponent>,
    testId: string,
  ): HTMLElement | null {
    return root(fixture).querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  }

  /** The cell of a weekday-hour slot, found through its row, as a reader would. */
  function cellAt(
    fixture: ComponentFixture<LineWeekProfileComponent>,
    weekday: number,
    hour: number,
  ): HTMLElement {
    const cell = root(fixture).querySelector<HTMLElement>(
      `[data-testid="line-week-row"][data-weekday="${weekday}"] [data-testid="line-week-cell"][data-hour="${hour}"]`,
    );
    expect(cell, `cell ${weekday}:${hour}`).not.toBeNull();
    return cell as HTMLElement;
  }

  it("reads the line's week over the literal window, from the service-day start", async () => {
    const fixture = render("line-9");

    const request = httpMock.expectOne((r) => r.body.query.includes("LineStatusWeekProfile"));
    expect(request.request.body.variables).toEqual({
      lineId: "line-9",
      weeks: 6,
      dayStartHour: 3,
    });
    // The two literals are the ones the methodology page publishes, so the sentence cannot drift.
    expect(request.request.body.variables.weeks).toBe(WEEK_PROFILE_WEEKS);
    expect(request.request.body.variables.dayStartHour).toBe(SERVICE_DAY_START_HOUR);
    request.flush({ data: { lineStatusWeekProfile: [] } });
    await fixture.whenStable();
  });

  it("shows a skeleton, and no strip, until the read answers", async () => {
    const fixture = render();

    expect(byTestId(fixture, "line-week-profile")).not.toBeNull();
    expect(byTestId(fixture, "line-week-profile-skeleton")).not.toBeNull();
    expect(byTestId(fixture, "line-week-profile-table")).toBeNull();
    expect(byTestId(fixture, "line-week-profile-empty")).toBeNull();

    await flushWeek(fixture, sampleWeek());

    expect(byTestId(fixture, "line-week-profile-skeleton")).toBeNull();
    expect(byTestId(fixture, "line-week-profile-table")).not.toBeNull();
  });

  it("draws every state inside one block that reserves the strip's height, so the reports below never jump", async () => {
    // jsdom performs no layout, so this pins the single source of truth: one block carries the
    // minimum height and every state is drawn inside it. The measurement itself, in Chromium, is in
    // e2e/home.spec.ts. Before, only the skeleton held the height, and a one-line sentence dragged the
    // reports list up by about 200px under the rider's finger.
    const fixture = render("line-1");
    const section = byTestId(fixture, "line-week-profile") as HTMLElement;
    const body = byTestId(fixture, "line-week-profile-body") as HTMLElement;
    expect(body.parentElement).toBe(section);
    expect([...body.classList]).toContain(WEEK_STATE_MIN_HEIGHT_CLASS);
    // A minimum, not a fixed height: a body taller than the reserve (390px) still shows all of itself.
    expect([...body.classList].filter((name) => /^h-\d/.test(name))).toEqual([]);

    const states = [
      "line-week-profile-skeleton",
      "line-week-profile-table",
      "line-week-profile-readout",
      "line-week-profile-legend",
      "line-week-profile-empty",
      "line-week-profile-sparse",
    ];
    const present = (): string[] => states.filter((testId) => byTestId(fixture, testId) !== null);
    const expectOnlyInBody = (shown: string[]): void => {
      expect(present()).toEqual(shown);
      for (const testId of shown) {
        expect(body.contains(byTestId(fixture, testId)), testId).toBe(true);
      }
    };

    // Each answer goes through a new line id, so the same component shows every state in turn.
    const startLine = (lineId: string): void => {
      fixture.componentRef.setInput("lineId", lineId);
      fixture.detectChanges();
    };

    expectOnlyInBody(["line-week-profile-skeleton"]);
    await flushWeek(fixture, sampleWeek());
    expectOnlyInBody([
      "line-week-profile-table",
      "line-week-profile-readout",
      "line-week-profile-legend",
    ]);

    startLine("line-2");
    expectOnlyInBody(["line-week-profile-skeleton"]);
    await flushWeek(fixture, []);
    expectOnlyInBody(["line-week-profile-empty"]);

    startLine("line-3");
    expectOnlyInBody(["line-week-profile-skeleton"]);
    await flushWeek(fixture, fullWeek([slot(3, 15, 2)]));
    expectOnlyInBody(["line-week-profile-sparse"]);

    startLine("line-4");
    expectOnlyInBody(["line-week-profile-skeleton"]);
    const failing = httpMock.expectOne((r) => r.body.query.includes("LineStatusWeekProfile"));
    failing.flush({ errors: [{ message: "boom" }] });
    await fixture.whenStable();
    fixture.detectChanges();
    const banner = fixture.debugElement.query(By.directive(RetryBannerComponent));
    expect(banner).not.toBeNull();
    expect(body.contains(banner.nativeElement)).toBe(true);
    expectOnlyInBody([]);
  });

  it("draws seven weekday rows of 24 hour cells, Monday first, from the service-day start", async () => {
    const fixture = render();
    await flushWeek(fixture, sampleWeek());

    const rows = [...root(fixture).querySelectorAll<HTMLElement>('[data-testid="line-week-row"]')];
    expect(rows.map((row) => row.getAttribute("data-weekday"))).toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
    ]);
    expect(root(fixture).querySelectorAll('[data-testid="line-week-cell"]')).toHaveLength(168);
    for (const row of rows) {
      const hours = [...row.querySelectorAll('[data-testid="line-week-cell"]')].map((cell) =>
        cell.getAttribute("data-hour"),
      );
      expect(hours).toEqual([
        ...Array.from({ length: 21 }, (_, index) => String(3 + index)),
        "0",
        "1",
        "2",
      ]);
    }
  });

  it("colours a cell with its dominant status and mutes the cells below the minimum", async () => {
    const fixture = render();
    await flushWeek(fixture, sampleWeek());

    const crowded = cellAt(fixture, 3, 15);
    expect(crowded.className).toContain(PASSENGER_BAR_CLASS["CROWDED"]);
    expect(crowded.hasAttribute("data-muted")).toBe(false);

    const disrupted = cellAt(fixture, 3, 16);
    expect(disrupted.className).toContain("bg-rose-600");
    expect(disrupted.hasAttribute("data-muted")).toBe(false);

    // Two reports is below the minimum of three: the muted track, whatever those two said.
    const thin = cellAt(fixture, 3, 8);
    expect(thin.hasAttribute("data-muted")).toBe(true);
    expect(thin.className).toContain(PASSENGER_NO_DATA_BAR_CLASS);
    expect(thin.className).not.toContain("bg-amber-500");

    const single = cellAt(fixture, 4, 9);
    expect(single.hasAttribute("data-muted")).toBe(true);

    // The 164 slots with nothing in them are muted too: only the two clear cells are coloured.
    expect(
      root(fixture).querySelectorAll('[data-testid="line-week-cell"]:not([data-muted])'),
    ).toHaveLength(2);
    expect(
      root(fixture).querySelectorAll('[data-testid="line-week-cell"][data-muted]'),
    ).toHaveLength(166);
  });

  it("reads as a table: caption, weekday row headers, hour column headers and text in each cell", async () => {
    const fixture = render();
    await flushWeek(fixture, sampleWeek());

    const table = byTestId(fixture, "line-week-profile-table");
    expect(table?.tagName).toBe("TABLE");
    expect(table?.querySelector("caption")?.textContent).toContain("Typical week for this line");
    expect(table?.querySelector("caption")?.textContent).toContain(
      `last ${WEEK_PROFILE_WEEKS} weeks`,
    );

    const rowHeaders = [...(table?.querySelectorAll('tbody th[scope="row"]') ?? [])];
    expect(rowHeaders.map((header) => header.querySelector(".sr-only")?.textContent)).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ]);
    // The short label is for the eye; the name is what a screen reader gets.
    expect(rowHeaders[0]?.querySelector('[aria-hidden="true"]')?.textContent).toBe("Mon");

    const columnHeaders = [...(table?.querySelectorAll('thead th[scope="col"]') ?? [])];
    expect(columnHeaders).toHaveLength(25);
    expect(columnHeaders[1]?.querySelector(".sr-only")?.textContent).toBe("03:00–04:00");
    expect(columnHeaders[21]?.querySelector(".sr-only")?.textContent).toBe("23:00–00:00");
    expect(columnHeaders[1]?.querySelector('[aria-hidden="true"]')?.textContent).toBe("03");
  });

  it("names every cell: a one-sentence aria-label and the status and count as text", async () => {
    const fixture = render();
    await flushWeek(fixture, sampleWeek());

    const busy = cellAt(fixture, 3, 15);
    expect(busy.getAttribute("aria-label")).toBe("Thursday 15:00–16:00 · 9 reports · Crowded 9");
    expect(busy.textContent?.trim()).toBe("Crowded, 9 reports");

    const mixed = cellAt(fixture, 3, 16);
    expect(mixed.getAttribute("aria-label")).toBe(
      "Thursday 16:00–17:00 · 5 reports · Crowded 2, Disrupted 3",
    );
    expect(mixed.textContent?.trim()).toBe("Disrupted, 5 reports");

    const thin = cellAt(fixture, 3, 8);
    expect(thin.getAttribute("aria-label")).toBe(
      "Thursday 08:00–09:00 · Not enough reports (2 of 3)",
    );
    expect(thin.textContent?.trim()).toBe("Not enough reports (2 of 3)");

    // A slot that holds nothing still says what it is, rather than being a silent cell.
    expect(cellAt(fixture, 0, 3).textContent?.trim()).toBe("Not enough reports (0 of 3)");
  });

  it("keeps the pointer-only aids out of the accessibility tree", async () => {
    const fixture = render();
    await flushWeek(fixture, sampleWeek());

    expect(byTestId(fixture, "line-week-profile-readout")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
    expect(byTestId(fixture, "line-week-profile-legend")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("draws the readout BELOW the table, so a readout that wraps cannot move the cells under the pointer", async () => {
    const fixture = render();
    await flushWeek(fixture, sampleWeek());

    // A readout above the table grew by a line for a mixed hour and pushed the table down, so a still
    // pointer ended up over the row above and showed that cell instead (seen at 390px in Chromium).
    const table = byTestId(fixture, "line-week-profile-table") as HTMLElement;
    const readout = byTestId(fixture, "line-week-profile-readout") as HTMLElement;
    expect(table.compareDocumentPosition(readout)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("shows a cell's reports in the readout on hover or tap, and clears it when the pointer leaves", async () => {
    const fixture = render();
    await flushWeek(fixture, sampleWeek());

    const readout = byTestId(fixture, "line-week-profile-readout");
    expect(readout?.textContent).toContain("Last 6 weeks. Hover or tap an hour for its reports");

    cellAt(fixture, 3, 15).dispatchEvent(new MouseEvent("mouseenter"));
    fixture.detectChanges();
    expect(readout?.textContent).toContain("Thursday 15:00–16:00 · 9 reports · Crowded 9");

    // A tap on a touch screen has no hover to leave: the click sets the readout as well.
    cellAt(fixture, 3, 8).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    fixture.detectChanges();
    expect(readout?.textContent).toContain("Thursday 08:00–09:00 · Not enough reports (2 of 3)");

    byTestId(fixture, "line-week-profile-table")?.dispatchEvent(new MouseEvent("mouseleave"));
    fixture.detectChanges();
    expect(readout?.textContent).toContain("Hover or tap an hour for its reports");
    expect(readout?.textContent).not.toContain("Thursday");
  });

  it("lists the seven statuses and the not-enough-reports swatch in a legend", async () => {
    const fixture = render();
    await flushWeek(fixture, sampleWeek());

    const legend = byTestId(fixture, "line-week-profile-legend")?.textContent ?? "";
    for (const label of [
      "Normal",
      "Busy",
      "Crowded",
      "Extremely Crowded",
      "Backlogged",
      "Delayed",
      "Disrupted",
      "Not enough reports",
    ]) {
      expect(legend).toContain(label);
    }
  });

  it("says so when the line has no report in the window", async () => {
    const fixture = render();
    await flushWeek(fixture, []);

    const empty = byTestId(fixture, "line-week-profile-empty");
    expect(empty?.textContent?.trim()).toBe("No reports in the last 6 weeks");
    expect(byTestId(fixture, "line-week-profile-table")).toBeNull();
    expect(byTestId(fixture, "line-week-profile-skeleton")).toBeNull();
    expect(fixture.debugElement.query(By.directive(RetryBannerComponent))).toBeNull();
  });

  it("says so, in words, when reports exist but no hour clears the minimum", async () => {
    const fixture = render();
    await flushWeek(fixture, fullWeek([slot(3, 15, 2), slot(4, 9, 1)]));

    const sparse = byTestId(fixture, "line-week-profile-sparse");
    expect(sparse?.textContent).toContain("3 reports in the last 6 weeks");
    expect(sparse?.textContent).toContain(`fewer than ${MIN_REPORTS_PER_WEEK_SLOT}`);
    // Not 168 grey boxes.
    expect(byTestId(fixture, "line-week-profile-table")).toBeNull();
    expect(byTestId(fixture, "line-week-profile-empty")).toBeNull();
  });

  it("shows the shared retry banner when the read fails, and no strip", async () => {
    const fixture = render();

    const request = httpMock.expectOne((r) => r.body.query.includes("LineStatusWeekProfile"));
    request.flush({ errors: [{ message: "boom" }] });
    await fixture.whenStable();
    fixture.detectChanges();

    const banner = fixture.debugElement.query(By.directive(RetryBannerComponent));
    expect(banner).not.toBeNull();
    expect(banner.nativeElement.textContent).toContain("Couldn't load this line's typical week.");
    expect(byTestId(fixture, "line-week-profile-table")).toBeNull();
    expect(byTestId(fixture, "line-week-profile-empty")).toBeNull();
    expect(byTestId(fixture, "line-week-profile-skeleton")).toBeNull();
    // The title stays: the section is still there, only its content could not load.
    expect(root(fixture).querySelector("h4")?.textContent).toContain("Typical week");
  });

  it("shows the skeleton, never 'no reports', while another line's week loads", async () => {
    const fixture = render("line-1");
    await flushWeek(fixture, sampleWeek());
    expect(byTestId(fixture, "line-week-profile-table")).not.toBeNull();

    // `graphqlResource` drops its payload when the request changes and its `isLoading` does not turn
    // true again, so a view built on `data() ?? []` would blink to the empty message here.
    fixture.componentRef.setInput("lineId", "line-2");
    fixture.detectChanges();
    const request = httpMock.expectOne((r) => r.body.query.includes("LineStatusWeekProfile"));
    expect(request.request.body.variables.lineId).toBe("line-2");

    expect(byTestId(fixture, "line-week-profile-skeleton")).not.toBeNull();
    expect(byTestId(fixture, "line-week-profile-empty")).toBeNull();
    expect(byTestId(fixture, "line-week-profile-table")).toBeNull();

    request.flush({ data: { lineStatusWeekProfile: [] } });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(byTestId(fixture, "line-week-profile-empty")).not.toBeNull();
  });

  it("explains itself from the methodology registry, with a link to the full method", async () => {
    const fixture = render();
    await flushWeek(fixture, sampleWeek());

    const trigger = root(fixture).querySelector<HTMLButtonElement>("app-info-popover button");
    expect(trigger?.getAttribute("aria-label")).toBe("What is Typical week?");
    trigger?.click();
    fixture.detectChanges();

    const panel = byTestId(fixture, "line-week-profile-popover");
    expect(panel?.textContent).toContain(metricTooltip("line-status.typical-week"));
    expect(panel?.textContent).toContain(`last ${WEEK_PROFILE_WEEKS} weeks`);
    expect(panel?.querySelector("a")?.getAttribute("href")).toBe("/methodology#line-status");
  });
});
