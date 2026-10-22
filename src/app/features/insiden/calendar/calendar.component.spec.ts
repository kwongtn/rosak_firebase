import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { metricTooltip } from "../../../core/methodology/methodology-render.util";
import type { CalendarIncident } from "../data/insiden.queries";
import { IncidentCalendarComponent } from "./calendar.component";

describe("IncidentCalendarComponent", () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IncidentCalendarComponent],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    }).compileComponents();
  });

  afterEach(() => vi.useRealTimers());

  /** Renders the calendar with the wall clock frozen at `now` (a UTC instant). */
  function render(now: string, selectedDate: string): ComponentFixture<IncidentCalendarComponent> {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(now));
    const fixture = TestBed.createComponent(IncidentCalendarComponent);
    fixture.componentRef.setInput("incidents", []);
    fixture.componentRef.setInput("selectedDate", selectedDate);
    fixture.detectChanges();
    return fixture;
  }

  function root(fixture: ComponentFixture<IncidentCalendarComponent>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it("names its month and year fields for assistive tech", () => {
    const fixture = render("2026-10-20T19:30:00Z", "2026-10-15");

    const labels = Array.from(root(fixture).querySelectorAll("hlm-combobox input")).map((input) =>
      input.getAttribute("aria-label"),
    );
    expect(labels).toEqual(["Month", "Year"]);
  });

  // The next two cases only differ between the two frames while UTC trails Malaysia (00:00-08:00
  // MYT), which is why the clock is frozen inside that window.
  it("rings the Kuala Lumpur day as today, not the UTC day", () => {
    // 03:30 MYT on 21 Oct; UTC is still the 20th.
    const fixture = render("2026-10-20T19:30:00Z", "2026-10-15");

    const ringed = Array.from(root(fixture).querySelectorAll("button.ring-1")).map((cell) =>
      cell.textContent?.trim(),
    );
    expect(ringed).toEqual(["21"]);
  });

  it("jumps to the Kuala Lumpur day and month from the Today button", async () => {
    // 01:00 MYT on 1 Oct; UTC is still 30 Sep, which would select September 30 and show September.
    const fixture = render("2026-09-30T17:00:00Z", "2026-09-15");
    const selected: string[] = [];
    fixture.componentInstance.daySelected.subscribe((dateKey) => selected.push(dateKey));

    const todayButton = Array.from(root(fixture).querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Today",
    );
    if (!todayButton) throw new Error("Today button not rendered");
    todayButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(selected).toEqual(["2026-10-01"]);
    const [month] = Array.from(
      root(fixture).querySelectorAll<HTMLInputElement>("hlm-combobox input"),
    );
    expect(month.value).toBe("October");
  });

  it("steps the month from Jan 31 and clamps the selected day into February", async () => {
    const fixture = render("2026-10-20T18:30:00Z", "2026-01-31");
    const days: string[] = [];
    fixture.componentInstance.daySelected.subscribe((dateKey) => days.push(dateKey));

    root(fixture).querySelector<HTMLButtonElement>('button[aria-label="Next month"]')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    // 2026 is not a leap year: the 31st becomes the 28th, not March 3.
    expect(days).toEqual(["2026-02-28"]);
    const [month] = Array.from(
      root(fixture).querySelectorAll<HTMLInputElement>("hlm-combobox input"),
    );
    expect(month.value).toBe("February");
  });

  it("steps back a month from Jan 31 into December's last day", () => {
    const fixture = render("2026-10-20T18:30:00Z", "2026-01-31");
    const days: string[] = [];
    fixture.componentInstance.daySelected.subscribe((dateKey) => days.push(dateKey));

    root(fixture).querySelector<HTMLButtonElement>('button[aria-label="Previous month"]')?.click();

    expect(days).toEqual(["2025-12-31"]);
  });

  it("returns to the Kuala Lumpur day from the Today button at 02:30 MYT", async () => {
    // 18:30 UTC on 20 Oct is 02:30 on 21 Oct in Kuala Lumpur.
    const fixture = render("2026-10-20T18:30:00Z", "2026-01-31");
    const days: string[] = [];
    fixture.componentInstance.daySelected.subscribe((dateKey) => days.push(dateKey));

    Array.from(root(fixture).querySelectorAll("button"))
      .find((button) => button.textContent?.trim() === "Today")
      ?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(days).toEqual(["2026-10-21"]);
    const [month] = Array.from(
      root(fixture).querySelectorAll<HTMLInputElement>("hlm-combobox input"),
    );
    expect(month.value).toBe("October");
  });

  it("labels the previous and next month buttons", () => {
    const fixture = render("2026-10-20T18:30:00Z", "2026-10-15");

    expect(root(fixture).querySelectorAll('button[aria-label="Previous month"]')).toHaveLength(1);
    expect(root(fixture).querySelectorAll('button[aria-label="Next month"]')).toHaveLength(1);
  });

  describe("day dots", () => {
    const base: Omit<CalendarIncident, "id" | "startDatetime"> = {
      endDatetime: "2026-10-05T10:00:00",
      severity: "MAJOR",
      title: "x",
      brief: "",
      details: "",
      hasDetails: false,
      impactFactor: 0,
      longTerm: false,
      inaccurate: false,
      lastUpdated: "2026-10-05T10:00:00",
      lines: [],
      vehicles: [],
      stations: [],
      chronologies: [],
      voteScore: 0,
      voteBreakdown: { upvotes: 0, downvotes: 0 },
      userVote: 0,
      medias: [],
    };
    function incident(id: string, overrides: Partial<CalendarIncident>): CalendarIncident {
      return { ...base, id, startDatetime: "2026-10-05T09:00:00", ...overrides };
    }

    /** The grid cell for `day` of the viewed month (out-of-month cells are muted). */
    function cell(fixture: ComponentFixture<IncidentCalendarComponent>, day: number): HTMLElement {
      const match = Array.from(
        root(fixture).querySelectorAll<HTMLElement>("div.grid-cols-7 > button"),
      ).find(
        (button) =>
          button.textContent?.trim() === String(day) &&
          !button.classList.contains("text-muted-foreground"),
      );
      if (!match) throw new Error(`day ${day} not in the grid`);
      return match;
    }

    /** The bg-* colour token of each dot in a cell, in render order. */
    function dots(fixture: ComponentFixture<IncidentCalendarComponent>, day: number): string[] {
      return Array.from(cell(fixture, day).querySelectorAll("span.rounded-full")).map(
        (dot) => dot.className.match(/bg-[a-z0-9-]+/)?.[0] ?? "",
      );
    }

    it("shows one dot per severity present, on every day a multi-day incident covers", () => {
      const fixture = render("2026-10-20T18:30:00Z", "2026-10-15");
      fixture.componentRef.setInput("incidents", [
        // 5-7 Oct, MAJOR: a dot on each day it covers.
        incident("multi", { endDatetime: "2026-10-07T10:00:00" }),
        // Same start day, MINOR: day 5 gets a second dot and a count of two.
        incident("minor", { severity: "MINOR" }),
        // Open-ended MAJOR from the 10th: a dot only on its first day.
        incident("open", { startDatetime: "2026-10-10T09:00:00", endDatetime: null }),
        // Long-term from the 2nd, OTHERS: a dot only on its first day.
        incident("long", {
          startDatetime: "2026-10-02T09:00:00",
          endDatetime: "2026-10-30T10:00:00",
          severity: "OTHERS",
          longTerm: true,
        }),
        // Long-term started in September: no dot anywhere in October's grid.
        incident("older", {
          startDatetime: "2026-09-01T09:00:00",
          endDatetime: "2026-10-30T10:00:00",
          severity: "MINOR",
          longTerm: true,
        }),
      ]);
      fixture.detectChanges();

      expect(dots(fixture, 5)).toEqual(["bg-destructive", "bg-amber-500"]);
      expect(cell(fixture, 5).title).toBe("2 incidents");
      expect(dots(fixture, 6)).toEqual(["bg-destructive"]);
      expect(dots(fixture, 7)).toEqual(["bg-destructive"]);
      expect(dots(fixture, 8)).toEqual([]);
      expect(dots(fixture, 10)).toEqual(["bg-destructive"]);
      expect(dots(fixture, 11)).toEqual([]);
      expect(dots(fixture, 2)).toEqual(["bg-neutral-400"]);
      expect(dots(fixture, 3)).toEqual([]);
      expect(dots(fixture, 1)).toEqual([]);
      expect(cell(fixture, 2).title).toBe("1 incident");
    });
  });

  describe("Export month", () => {
    function exportButtons(fixture: ComponentFixture<IncidentCalendarComponent>): {
      csv: HTMLButtonElement;
      ics: HTMLButtonElement;
    } {
      const csv = root(fixture).querySelector<HTMLButtonElement>(
        '[data-testid="export-month-csv"]',
      );
      const ics = root(fixture).querySelector<HTMLButtonElement>(
        '[data-testid="export-month-ics"]',
      );
      if (!csv || !ics) throw new Error("export buttons not rendered");
      return { csv, ics };
    }

    it("sits in the calendar header as a labelled group with both formats", () => {
      const fixture = render("2026-10-20T19:30:00Z", "2026-10-15");

      const group = root(fixture).querySelector('[role="group"][aria-label="Export month"]');
      expect(group).not.toBeNull();
      const { csv, ics } = exportButtons(fixture);
      expect(csv.textContent?.trim()).toBe(".csv");
      expect(ics.textContent?.trim()).toBe(".ics");
      expect(csv.getAttribute("aria-label")).toContain("CSV");
      expect(ics.getAttribute("aria-label")).toContain("iCalendar");
    });

    it("shows how many incidents the export would hold", () => {
      const fixture = render("2026-10-20T19:30:00Z", "2026-10-15");
      fixture.componentRef.setInput("exportCount", 7);
      fixture.detectChanges();

      expect(
        root(fixture).querySelector('[data-testid="calendar-export-count"]')?.textContent?.trim(),
      ).toBe("Export month (7)");
    });

    it("disables both buttons while there is nothing to export", () => {
      const fixture = render("2026-10-20T19:30:00Z", "2026-10-15");

      const { csv, ics } = exportButtons(fixture);
      expect(csv.disabled).toBe(true);
      expect(ics.disabled).toBe(true);

      fixture.componentRef.setInput("exportCount", 1);
      fixture.detectChanges();
      expect(exportButtons(fixture).csv.disabled).toBe(false);
      expect(exportButtons(fixture).ics.disabled).toBe(false);
    });

    it("emits the chosen format and nothing else", () => {
      const fixture = render("2026-10-20T19:30:00Z", "2026-10-15");
      fixture.componentRef.setInput("exportCount", 2);
      fixture.detectChanges();
      const formats: string[] = [];
      const days: string[] = [];
      fixture.componentInstance.exportMonth.subscribe((format) => formats.push(format));
      fixture.componentInstance.daySelected.subscribe((dateKey) => days.push(dateKey));

      exportButtons(fixture).csv.click();
      exportButtons(fixture).ics.click();

      expect(formats).toEqual(["csv", "ics"]);
      // Exporting is not a navigation: it must not move the selected day.
      expect(days).toEqual([]);
    });

    it("explains what the files hold, from the methodology registry", () => {
      const fixture = render("2026-10-20T19:30:00Z", "2026-10-15");

      const trigger = root(fixture).querySelector<HTMLButtonElement>(
        'button[aria-label="What is Export month?"]',
      );
      expect(trigger).not.toBeNull();
      trigger?.click();
      fixture.detectChanges();

      const panel = root(fixture).querySelector<HTMLElement>(
        '[data-testid="calendar-export-popover"]',
      );
      expect(panel?.textContent).toContain(metricTooltip("incidents.month-export"));
      // The rule a rider cannot see in the buttons: approved only, started in the month.
      expect(panel?.textContent).toContain(
        "Drafts, pending and rejected reports are never exported",
      );
      expect(panel?.querySelector("a")?.getAttribute("href")).toBe("/methodology#episodes");
    });

    it("emits nothing from a disabled button", () => {
      const fixture = render("2026-10-20T19:30:00Z", "2026-10-15");
      const formats: string[] = [];
      fixture.componentInstance.exportMonth.subscribe((format) => formats.push(format));

      exportButtons(fixture).csv.click();

      expect(formats).toEqual([]);
    });
  });
});
