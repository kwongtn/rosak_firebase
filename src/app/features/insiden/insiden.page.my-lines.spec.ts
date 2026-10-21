import { CUSTOM_ELEMENTS_SCHEMA, Component, provideZonelessChangeDetection } from "@angular/core";
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
import { IncidentCardComponent } from "./incident-card/incident-card.component";
import { IncidentHistoryComponent } from "./incident-history/incident-history.component";
import { InsidenPage } from "./insiden.page";
import { LinksSectionComponent } from "./links-section/links-section.component";

/** The preferences service's own storage key, restated so a rename breaks this spec loudly. */
const STORAGE_KEY = "rosak:preferences:v1";

@Component({ selector: "app-route-stub", template: "" })
class RouteStub {}

function incident(id: string, lineId: string, code: string): CalendarIncident {
  return {
    id,
    severity: "MINOR",
    lines: [{ id: lineId, code, displayName: `${code} line` }],
    startDatetime: "2026-10-05T08:00:00",
    endDatetime: "2026-10-05T09:00:00",
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
 * "My lines" against the REAL `PreferencesService` (the neighbouring filters spec stubs it), so the
 * page is proven to read the service's actual `pinnedLineIds` signal — including its post-render
 * hydration from localStorage — rather than the stub's idea of it.
 */
describe("InsidenPage My lines with the real PreferencesService", () => {
  let fixture: ComponentFixture<InsidenPage>;
  let httpMock: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [InsidenPage],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClientTesting(),
        provideRouter([{ path: "**", component: RouteStub }]),
        {
          provide: AuthService,
          useValue: { isLoggedIn: () => false, isAdmin: () => false, user: () => null },
        },
        { provide: GraphQLClient, useValue: { request: vi.fn() } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
      ],
    })
      .overrideComponent(InsidenPage, {
        remove: {
          imports: [
            AppNavComponent,
            AppFooterComponent,
            AdSlotComponent,
            IncidentCardComponent,
            IncidentCalendarComponent,
            IncidentHistoryComponent,
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
    localStorage.clear();
  });

  async function boot(url: string): Promise<void> {
    await router.navigateByUrl(url);
    fixture = TestBed.createComponent(InsidenPage);
    fixture.componentRef.setInput("date", "2026-10-05");
    fixture.detectChanges();
    TestBed.tick();
    httpMock
      .expectOne((request) => request.body?.query === INSIDEN_INCIDENTS_QUERY)
      .flush({
        data: {
          calendarIncidents: [incident("a", "3", "KJL"), incident("b", "1", "AG")],
        },
      });
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function dayCardIds(): string[] {
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll("app-incident-card")]
      .map((card) => (Reflect.get(card, "incident") as CalendarIncident).id)
      .sort();
  }

  it("narrows a ?mine=1 deep link to the pins stored in localStorage once they hydrate", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ pinnedLineIds: ["3"] }));

    await boot("/?mine=1");

    expect(dayCardIds()).toEqual(["a"]);
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('[data-testid="filter-mine"]')
        ?.textContent?.replace(/\s+/g, " ")
        .trim(),
    ).toBe("My lines (1)");
  });

  it("shows everything for a reader with no pins, with the explanation", async () => {
    await boot("/?mine=1");

    expect(dayCardIds()).toEqual(["a", "b"]);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="filter-no-pins"]'),
    ).not.toBeNull();
  });

  it("follows a pin made elsewhere while the page is open", async () => {
    await boot("/?mine=1");
    expect(dayCardIds()).toEqual(["a", "b"]);

    TestBed.inject(PreferencesService).togglePin("1");
    await fixture.whenStable();
    fixture.detectChanges();

    expect(dayCardIds()).toEqual(["b"]);
  });
});
