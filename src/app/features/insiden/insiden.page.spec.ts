import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "../../core/auth/auth.service";
import { klDateKey } from "../../core/time/kl-date";
import { INSIDEN_INCIDENTS_QUERY } from "./data/insiden.queries";
import { calendarMonthRange } from "./data/calendar-date.util";
import { IncidentSheetService } from "./data/incident-sheet.service";
import { InsidenPage } from "./insiden.page";

describe("InsidenPage date-window requests", () => {
  beforeEach(async () => {
    // `compileComponents()` is required now that the page's template holds a `@defer` block (the
    // incident form waits for its sheet to open): TestBed cannot compile such a component
    // synchronously, even though the override below swaps the template out.
    await TestBed.configureTestingModule({
      imports: [InsidenPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthService, useValue: {} },
      ],
    })
      .overrideComponent(InsidenPage, { set: { template: "", imports: [] } })
      .compileComponents();
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.inject(HttpTestingController).verify();
  });

  function expectWindow(start: string, end: string): void {
    const request = TestBed.inject(HttpTestingController).expectOne(
      (req) => req.body.query === INSIDEN_INCIDENTS_QUERY,
    );
    expect(request.request.body.variables).toEqual({
      filters: { date: { range: { start, end } }, OR: { ongoing: true } },
    });
    expect(request.request.body.query).toContain("calendarIncidents(filters: $filters)");
    request.flush({ data: { calendarIncidents: [] } });
    TestBed.tick();
  }

  it("requests the current month's padded window on the bare route", () => {
    const fixture = TestBed.createComponent(InsidenPage);
    const range = calendarMonthRange(klDateKey().slice(0, 7));
    fixture.detectChanges();
    TestBed.tick();
    expectWindow(range.start, range.end);
  });

  it("defaults the bare route to the Kuala Lumpur day, not the UTC day", () => {
    // 01:00 MYT on 1 Oct: UTC is still 30 Sep, so a UTC "today" would open (and fetch) September.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T17:00:00Z"));
    const fixture = TestBed.createComponent(InsidenPage);
    fixture.detectChanges();
    TestBed.tick();

    expect(
      (fixture.componentInstance as unknown as { selectedDate(): string }).selectedDate(),
    ).toBe("2026-10-01");
    expectWindow("2026-09-17", "2026-11-14");
  });

  it("loads a deep-linked month, reuses it for day selection, and reloads across months", () => {
    const fixture = TestBed.createComponent(InsidenPage);
    fixture.componentRef.setInput("date", "2024-02-29");
    fixture.detectChanges();
    TestBed.tick();
    expectWindow("2024-01-18", "2024-03-14");

    fixture.componentRef.setInput("date", "2024-02-10");
    TestBed.tick();
    TestBed.inject(HttpTestingController).expectNone(
      (req) => req.body.query === INSIDEN_INCIDENTS_QUERY,
    );

    fixture.componentRef.setInput("date", "2024-03-10");
    TestBed.tick();
    expectWindow("2024-02-16", "2024-04-14");

    fixture.componentRef.setInput("date", "2024-02-29");
    TestBed.tick();
    expectWindow("2024-01-18", "2024-03-14");
  });

  it("retains the active date window when refreshing after a sheet closes", async () => {
    const fixture = TestBed.createComponent(InsidenPage);
    fixture.componentRef.setInput("date", "2026-09-17");
    fixture.detectChanges();
    TestBed.tick();
    expectWindow("2026-08-18", "2026-10-14");
    await fixture.whenStable();

    const sheet = TestBed.inject(IncidentSheetService);
    sheet.open();
    fixture.detectChanges();
    TestBed.tick();
    sheet.close();
    fixture.detectChanges();
    TestBed.tick();
    expectWindow("2026-08-18", "2026-10-14");
  });
});
