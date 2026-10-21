import {
  CUSTOM_ELEMENTS_SCHEMA,
  Component,
  provideZonelessChangeDetection,
  signal,
  type WritableSignal,
} from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { Router, provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../core/auth/auth.service";
import { GraphQLClient } from "../../core/graphql/graphql-client";
import { PreferencesService } from "../../core/preferences/preferences.service";
import { AppFooterComponent } from "../../shell/app-footer/app-footer.component";
import { AppNavComponent } from "../../shell/app-nav/app-nav.component";
import { AdSlotComponent } from "../../ui/ad-slot/ad-slot.component";
import { ToastService } from "../../ui/toast/toast.service";
import { IncidentCalendarComponent } from "./calendar/calendar.component";
import { INSIDEN_INCIDENTS_QUERY, type CalendarIncident } from "./data/insiden.queries";
import { INSIDEN_MONTHLY_HISTORY_QUERY } from "./data/insiden-history.queries";
import { IncidentCardComponent } from "./incident-card/incident-card.component";
import { InsidenPage } from "./insiden.page";
import { LinksSectionComponent } from "./links-section/links-section.component";

@Component({ selector: "app-route-stub", template: "" })
class RouteStub {}

const KJL = { id: "3", code: "KJL", displayName: "Kelana Jaya Line" };
const AG = { id: "1", code: "AG", displayName: "Ampang Line" };
const KGL = { id: "10", code: "KGL", displayName: "Kajang Line" };

function incident(
  id: string,
  severity: CalendarIncident["severity"],
  lines: CalendarIncident["lines"],
  startDatetime: string,
  endDatetime: string | null,
): CalendarIncident {
  return {
    id,
    severity,
    lines,
    startDatetime,
    endDatetime,
    status: "LIVE",
    title: `Incident ${id}`,
    brief: "",
    details: "",
    hasDetails: false,
    longTerm: false,
    vehicles: [],
    stations: [],
    categories: [],
    chronologies: [],
    medias: [],
  } as unknown as CalendarIncident;
}

/**
 * Four incidents covering 5 October, plus one ongoing incident that started AFTER the selected day:
 * an open-ended incident covers every day from its start, so only one that has not started yet falls
 * outside the day list and into the "Ongoing & Long-Running" section.
 */
const INCIDENTS: CalendarIncident[] = [
  incident("a", "MAJOR", [KJL], "2026-10-05T08:00:00", "2026-10-05T10:00:00"),
  incident("b", "MINOR", [KJL, AG], "2026-10-05T09:00:00", "2026-10-05T11:00:00"),
  incident("c", "MINOR", [KGL], "2026-10-05T07:00:00", "2026-10-05T08:00:00"),
  incident("e", "OTHERS", [], "2026-10-05T06:00:00", "2026-10-05T07:00:00"),
  incident("d", "MINOR", [AG], "2026-10-20T08:00:00", null),
];

describe("InsidenPage incident filters", () => {
  let fixture: ComponentFixture<InsidenPage>;
  let httpMock: HttpTestingController;
  let router: Router;
  let pins: WritableSignal<string[]>;

  beforeEach(async () => {
    pins = signal<string[]>([]);
    await TestBed.configureTestingModule({
      imports: [InsidenPage],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClientTesting(),
        provideRouter([{ path: "**", component: RouteStub }]),
        { provide: PreferencesService, useValue: { pinnedLineIds: pins.asReadonly() } },
        {
          provide: AuthService,
          useValue: { isLoggedIn: () => false, isAdmin: () => false, user: () => null },
        },
        { provide: GraphQLClient, useValue: { request: vi.fn() } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
      ],
    })
      .overrideComponent(InsidenPage, {
        // Chrome, ads and the children pull in live services; the page's own filtering is what is
        // under test, so the children are inert elements whose bound inputs the spec reads back.
        remove: {
          imports: [
            AppNavComponent,
            AppFooterComponent,
            AdSlotComponent,
            IncidentCardComponent,
            IncidentCalendarComponent,
            LinksSectionComponent,
          ],
        },
        add: { schemas: [CUSTOM_ELEMENTS_SCHEMA] },
      })
      .compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    httpMock.verify();
  });

  /** Boots the page on `url` (query string included) with the incidents read answered. */
  async function boot(url = "/", incidents: CalendarIncident[] = INCIDENTS): Promise<void> {
    await router.navigateByUrl(url);
    fixture = TestBed.createComponent(InsidenPage);
    fixture.componentRef.setInput("date", "2026-10-05");
    fixture.detectChanges();
    TestBed.tick();
    httpMock
      .expectOne((request) => request.body?.query === INSIDEN_INCIDENTS_QUERY)
      .flush({ data: { calendarIncidents: incidents } });
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** Lets a click's router write land and the page re-render from the new URL. */
  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;

  function byTestId(id: string): HTMLElement {
    const el = root().querySelector<HTMLElement>(`[data-testid="${id}"]`);
    if (!el) {
      throw new Error(`no [data-testid="${id}"]`);
    }
    return el;
  }

  /** The `incident` each card in the section headed `heading` was handed, by id. */
  function cardIdsIn(heading: string): string[] {
    const section = [...root().querySelectorAll("section")].find((candidate) =>
      candidate.querySelector("h2")?.textContent?.includes(heading),
    );
    return [...(section?.querySelectorAll("app-incident-card") ?? [])].map(
      (card) => (Reflect.get(card, "incident") as CalendarIncident).id,
    );
  }

  function calendarIncidentIds(): string[] {
    const calendar = root().querySelector("app-incident-calendar");
    return (Reflect.get(calendar as Element, "incidents") as CalendarIncident[]).map(
      (entry) => entry.id,
    );
  }

  const dayIds = (): string[] => cardIdsIn("October 5, 2026").sort();
  const pinnedIds = (): string[] => cardIdsIn("Ongoing").sort();

  function chipCodes(): string[] {
    return [...root().querySelectorAll<HTMLElement>('[data-testid^="filter-line-"]')].map(
      (chip) => chip.textContent?.trim() ?? "",
    );
  }

  function pressed(id: string): boolean {
    return byTestId(id).getAttribute("aria-pressed") === "true";
  }

  async function chooseSeverity(value: string): Promise<void> {
    const select = byTestId("filter-severity") as HTMLSelectElement;
    select.value = value;
    select.dispatchEvent(new Event("change"));
    await settle();
  }

  describe("without a filter", () => {
    it("shows every loaded incident and offers a chip for each line they reference", async () => {
      await boot();

      expect(dayIds()).toEqual(["a", "b", "c", "e"]);
      expect(pinnedIds()).toEqual(["d"]);
      // Sorted by code, none pinned.
      expect(chipCodes()).toEqual(["AG", "KGL", "KJL"]);
      expect(root().querySelector('[data-testid="filter-clear"]')).toBeNull();
      expect(root().querySelector('[data-testid="filter-count"]')).toBeNull();
    });

    it("says the filters apply to the shown month's loaded window, not all history", async () => {
      await boot();

      const note = byTestId("filter-scope").textContent ?? "";
      expect(note).toContain("October 2026");
      expect(note).toContain("14 days either side");
      expect(note).toContain("ongoing");
      expect(note).toContain("not to all history");
    });

    it("hands the calendar the same incidents it would have had before filters existed", async () => {
      await boot();

      expect(calendarIncidentIds().sort()).toEqual(["a", "b", "c", "d", "e"]);
    });

    it("leads the chips with the reader's pinned lines", async () => {
      pins.set(["10"]);
      await boot();

      expect(chipCodes()).toEqual(["KGL", "AG", "KJL"]);
    });
  });

  describe("line filter", () => {
    it("narrows the day list, the pinned section and the calendar to the chosen line", async () => {
      await boot();

      byTestId("filter-line-3").click();
      await settle();

      expect(router.url).toBe("/?lines=3");
      expect(dayIds()).toEqual(["a", "b"]);
      expect(pinnedIds()).toEqual([]);
      expect(calendarIncidentIds().sort()).toEqual(["a", "b"]);
      expect(pressed("filter-line-3")).toBe(true);
      expect(pressed("filter-line-1")).toBe(false);
    });

    it("keeps every chip while narrowed, so another line can still be added", async () => {
      await boot();

      byTestId("filter-line-3").click();
      await settle();

      expect(chipCodes()).toEqual(["AG", "KGL", "KJL"]);
    });

    it("widens to the union when a second line is added, and back when one is removed", async () => {
      await boot();

      byTestId("filter-line-3").click();
      await settle();
      byTestId("filter-line-10").click();
      await settle();
      expect(router.url).toBe("/?lines=3,10");
      expect(dayIds()).toEqual(["a", "b", "c"]);

      byTestId("filter-line-3").click();
      await settle();
      expect(router.url).toBe("/?lines=10");
      expect(dayIds()).toEqual(["c"]);
    });

    it("removes the param entirely when the last line is deselected", async () => {
      await boot("/?lines=3");

      byTestId("filter-line-3").click();
      await settle();

      expect(router.url).toBe("/");
      expect(dayIds()).toEqual(["a", "b", "c", "e"]);
    });

    it("renders a deep link filtered on the very first render", async () => {
      await boot("/?lines=3,10");

      expect(dayIds()).toEqual(["a", "b", "c"]);
      expect(pressed("filter-line-3")).toBe(true);
      expect(pressed("filter-line-10")).toBe(true);
      expect(pressed("filter-line-1")).toBe(false);
    });

    it("ignores junk in ?lines= instead of breaking", async () => {
      await boot("/?lines=3,%3Cscript%3E,,zzz%20zzz");

      expect(dayIds()).toEqual(["a", "b"]);
    });
  });

  describe("severity filter", () => {
    it("narrows to one severity and writes it to the URL", async () => {
      await boot();

      await chooseSeverity("major");

      expect(router.url).toBe("/?severity=major");
      expect(dayIds()).toEqual(["a"]);
      expect(pinnedIds()).toEqual([]);
    });

    it("reads ?severity= on load and reflects it in the select", async () => {
      await boot("/?severity=minor");

      expect(dayIds()).toEqual(["b", "c"]);
      expect((byTestId("filter-severity") as HTMLSelectElement).value).toBe("minor");
    });

    it("combines with a line filter", async () => {
      await boot("/?lines=3&severity=minor");

      expect(dayIds()).toEqual(["b"]);
    });

    it("returns to all and drops the param when All is chosen again", async () => {
      await boot("/?severity=major");

      await chooseSeverity("all");

      expect(router.url).toBe("/");
      expect(dayIds()).toEqual(["a", "b", "c", "e"]);
    });

    it("treats an unknown ?severity= as no filter", async () => {
      await boot("/?severity=catastrophic");

      expect(dayIds()).toEqual(["a", "b", "c", "e"]);
    });
  });

  describe("My lines", () => {
    it("seeds the line selection from the pinned lines and writes mine=1", async () => {
      pins.set(["3"]);
      await boot();

      byTestId("filter-mine").click();
      await settle();

      expect(router.url).toBe("/?mine=1");
      expect(pressed("filter-mine")).toBe(true);
      expect(dayIds()).toEqual(["a", "b"]);
      // The pinned line's chip reads as selected too: the selection IS the pins.
      expect(pressed("filter-line-3")).toBe(true);
    });

    it("shows how many lines are pinned", async () => {
      pins.set(["3", "1"]);
      await boot();

      expect(byTestId("filter-mine").textContent?.replace(/\s+/g, " ").trim()).toBe("My lines (2)");
    });

    it("turns off, and clears the line selection, when pressed again", async () => {
      pins.set(["3"]);
      await boot("/?mine=1");

      byTestId("filter-mine").click();
      await settle();

      expect(router.url).toBe("/");
      expect(pressed("filter-mine")).toBe(false);
      expect(dayIds()).toEqual(["a", "b", "c", "e"]);
    });

    it("edits a COPY of the pins when a chip is pressed, and stops being 'mine'", async () => {
      pins.set(["3", "1"]);
      await boot("/?mine=1");
      expect(dayIds()).toEqual(["a", "b"]);

      byTestId("filter-line-3").click();
      await settle();

      // Pins were KJL + AG; removing KJL leaves AG as an explicit selection.
      expect(router.url).toBe("/?lines=1");
      expect(pressed("filter-mine")).toBe(false);
      expect(dayIds()).toEqual(["b"]);
    });

    it("tracks the reader's pins live, so a deep link resolves per reader", async () => {
      await boot("/?mine=1");
      // Nothing pinned yet (the server render and the first client render both see this).
      expect(dayIds()).toEqual(["a", "b", "c", "e"]);

      pins.set(["10"]);
      await settle();

      expect(dayIds()).toEqual(["c"]);
    });

    it("explains an empty pin list instead of showing an empty page", async () => {
      await boot("/?mine=1");

      expect(byTestId("filter-no-pins").textContent).toContain("not pinned any lines");
      expect(dayIds()).toEqual(["a", "b", "c", "e"]);
    });

    it("lets an explicit ?lines= win over mine=1", async () => {
      pins.set(["10"]);
      await boot("/?mine=1&lines=3");

      expect(dayIds()).toEqual(["a", "b"]);
      expect(pressed("filter-mine")).toBe(false);
    });
  });

  describe("state around the filter", () => {
    it("counts what matches out of what was loaded", async () => {
      await boot("/?lines=3");

      expect(byTestId("filter-count").textContent?.replace(/\s+/g, " ").trim()).toBe(
        "Showing 2 of 5.",
      );
    });

    it("clears everything with one button and removes every param", async () => {
      pins.set(["3"]);
      await boot("/?lines=3&severity=major");
      expect(router.url).toBe("/?lines=3&severity=major");

      byTestId("filter-clear").click();
      await settle();

      expect(router.url).toBe("/");
      expect(dayIds()).toEqual(["a", "b", "c", "e"]);
    });

    it("says so when the filter leaves the selected day empty", async () => {
      await boot("/?lines=10&severity=major");

      expect(byTestId("day-empty").textContent?.trim()).toBe(
        "No incidents match the filters on this day.",
      );
    });

    it("keeps the plain empty message when no filter is active", async () => {
      await boot("/", []);

      expect(byTestId("day-empty").textContent?.trim()).toBe("No incidents on this day.");
    });

    it("surfaces a selected line that has no chip, so the filter is never invisible", async () => {
      await boot("/?lines=3,999");

      expect(byTestId("filter-unlisted").textContent?.replace(/\s+/g, " ")).toContain(
        "1 selected line has no incident in this window.",
      );
    });

    it("keeps the filters in the URL when a day is picked", async () => {
      await boot("/?lines=3&severity=major");
      const navigate = vi.spyOn(router, "navigate").mockResolvedValue(true);

      (
        fixture.componentInstance as unknown as { onDaySelected(dateKey: string): void }
      ).onDaySelected("2026-10-06");

      expect(navigate).toHaveBeenCalledWith(["/insiden", "2026-10-06"], {
        queryParamsHandling: "preserve",
      });
    });
  });

  describe("Export month", () => {
    /** The `download` attribute and Blob of every anchor click, in click order. */
    const downloads: { filename: string; blob: Blob }[] = [];
    const urlStatics = URL as unknown as { createObjectURL?: unknown; revokeObjectURL?: unknown };
    const originalStatics = {
      create: urlStatics.createObjectURL,
      revoke: urlStatics.revokeObjectURL,
    };
    let lastBlob: Blob;

    /** Began in September and ran into October: loaded (the window pads the month) but not
     * "started in October". */
    const SPANNING = incident("s", "MINOR", [AG], "2026-09-28T08:00:00", "2026-10-06T08:00:00");

    function readBlobText(blob: Blob): Promise<string> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(blob);
      });
    }

    function exportMonth(format: "csv" | "ics"): void {
      (
        fixture.componentInstance as unknown as { onExportMonth(format: "csv" | "ics"): void }
      ).onExportMonth(format);
    }

    function calendarExportCount(): number {
      return Reflect.get(root().querySelector("app-incident-calendar") as Element, "exportCount");
    }

    beforeEach(() => {
      downloads.length = 0;
      urlStatics.createObjectURL = vi.fn((blob: Blob) => {
        lastBlob = blob;
        return "blob:fake";
      });
      urlStatics.revokeObjectURL = vi.fn();
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: {
        getAttribute(name: string): string | null;
      }) {
        downloads.push({ filename: this.getAttribute("download") ?? "", blob: lastBlob });
      });
    });

    afterEach(() => {
      urlStatics.createObjectURL = originalStatics.create;
      urlStatics.revokeObjectURL = originalStatics.revoke;
      vi.restoreAllMocks();
    });

    it("tells the calendar how many incidents started in the shown month", async () => {
      await boot("/", [...INCIDENTS, SPANNING]);

      // a, b, c, e and d started in October; the spanning one started in September.
      expect(calendarExportCount()).toBe(5);
    });

    it("counts only what survives the filter", async () => {
      await boot("/?lines=3", [...INCIDENTS, SPANNING]);

      expect(calendarExportCount()).toBe(2);
    });

    it("writes the filtered month as a CSV, oldest first, named for the month", async () => {
      await boot("/?lines=3", [...INCIDENTS, SPANNING]);

      exportMonth("csv");

      expect(downloads).toHaveLength(1);
      expect(downloads[0]?.filename).toBe("insiden-2026-10.csv");
      expect(downloads[0]?.blob.type).toBe("text/csv;charset=utf-8;");
      const rows = (await readBlobText(downloads[0]?.blob as Blob))
        .split("\r\n")
        .filter((line) => line !== "");
      expect(rows[0]).toBe("date,title,severity,lines,stations,status,url");
      // a (08:00) and b (09:00), both on KJL: oldest first, nothing else.
      expect(rows).toHaveLength(3);
      expect(rows[1]).toBe(
        "2026-10-05,Incident a,MAJOR,KJL,,LIVE,https://community.mlptf.org.my/insiden/2026-10-05",
      );
      expect(rows[2]).toContain("Incident b,MINOR,KJL; AG");
    });

    it("writes the same month as an iCalendar with one event per incident", async () => {
      await boot("/?lines=3", [...INCIDENTS, SPANNING]);

      exportMonth("ics");

      expect(downloads).toHaveLength(1);
      expect(downloads[0]?.filename).toBe("insiden-2026-10.ics");
      expect(downloads[0]?.blob.type).toBe("text/calendar;charset=utf-8");
      const ics = await readBlobText(downloads[0]?.blob as Blob);
      expect(ics.match(/^BEGIN:VEVENT/gm)).toHaveLength(2);
      expect(ics).toContain("UID:incident-a@community.mlptf.org.my");
      expect(ics).toContain("UID:incident-b@community.mlptf.org.my");
      expect(ics).not.toContain("UID:incident-c@");
      expect(ics).toContain("DTSTART;TZID=Asia/Kuala_Lumpur:20261005T080000");
    });

    it("exports the whole month when no filter is active", async () => {
      await boot("/", [...INCIDENTS, SPANNING]);

      exportMonth("csv");

      const rows = (await readBlobText(downloads[0]?.blob as Blob))
        .split("\r\n")
        .filter((line) => line !== "");
      // Header + a, b, c, e (5 Oct) + d (20 Oct); the September starter is not in October's file.
      expect(rows).toHaveLength(6);
      expect(rows.join("\n")).not.toContain("Incident s");
    });

    it("downloads nothing when the filtered month is empty", async () => {
      await boot("/?lines=10&severity=major", [...INCIDENTS, SPANNING]);

      exportMonth("csv");
      exportMonth("ics");

      expect(calendarExportCount()).toBe(0);
      expect(downloads).toEqual([]);
    });
  });

  describe("Last 12 months section", () => {
    const isHistoryRead = (request: { body?: { query?: string } | null }): boolean =>
      request.body?.query === INSIDEN_MONTHLY_HISTORY_QUERY;

    const historyToggle = (): HTMLElement => byTestId("incident-history-toggle");

    it("is mounted on the incidents tab, collapsed, with no read of its own", async () => {
      await boot();

      expect(root().querySelector('[data-testid="incident-history"]')).not.toBeNull();
      expect(historyToggle().getAttribute("aria-expanded")).toBe("false");
      expect(httpMock.match(isHistoryRead)).toHaveLength(0);
    });

    it("reads the 12 months ending at the selected month once it is opened", async () => {
      await boot();

      historyToggle().click();
      fixture.detectChanges();

      // 5 October 2026 -> November 2025 .. October 2026 -> calendar years 2025 and 2026.
      const request = httpMock.expectOne(isHistoryRead);
      expect(request.request.body.variables).toEqual({
        startYear: { date: { year: { exact: 2025 } } },
        endYear: { date: { year: { exact: 2026 } } },
      });
      request.flush({ data: { startYearIncidents: [], endYearIncidents: [] } });
      await settle();
    });

    it("follows the month when the route moves to another year pair", async () => {
      await boot();
      historyToggle().click();
      fixture.detectChanges();
      httpMock
        .expectOne(isHistoryRead)
        .flush({ data: { startYearIncidents: [], endYearIncidents: [] } });
      await settle();

      fixture.componentRef.setInput("date", "2027-01-10");
      fixture.detectChanges();
      TestBed.tick();
      httpMock
        .expectOne((request) => request.body?.query === INSIDEN_INCIDENTS_QUERY)
        .flush({ data: { calendarIncidents: [] } });
      const history = httpMock.expectOne(isHistoryRead);

      expect(history.request.body.variables).toEqual({
        startYear: { date: { year: { exact: 2026 } } },
        endYear: { date: { year: { exact: 2027 } } },
      });
      history.flush({ data: { startYearIncidents: [], endYearIncidents: [] } });
      await settle();
    });

    it("is not rendered on the Submitted Links tab", async () => {
      await boot();
      const tabs = [...root().querySelectorAll<HTMLButtonElement>("nav button")];
      tabs.find((tab) => tab.textContent?.includes("Submitted Links"))?.click();
      fixture.detectChanges();

      expect(root().querySelector('[data-testid="incident-history"]')).toBeNull();
    });
  });
});
