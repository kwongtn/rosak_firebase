import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IncidentCalendarComponent } from "./calendar.component";

describe("IncidentCalendarComponent", () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IncidentCalendarComponent],
      providers: [provideZonelessChangeDetection()],
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
});
