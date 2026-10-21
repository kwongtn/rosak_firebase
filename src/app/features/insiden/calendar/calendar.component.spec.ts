import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { metricTooltip } from "../../../core/methodology/methodology-render.util";
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
