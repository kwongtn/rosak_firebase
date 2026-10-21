import {
  CUSTOM_ELEMENTS_SCHEMA,
  provideZonelessChangeDetection,
  type WritableSignal,
} from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../core/auth/auth.service";
import { GraphQLClient } from "../../core/graphql/graphql-client";
import { AppFooterComponent } from "../../shell/app-footer/app-footer.component";
import { AppNavComponent } from "../../shell/app-nav/app-nav.component";
import { AdSlotComponent } from "../../ui/ad-slot/ad-slot.component";
import { ToastService } from "../../ui/toast/toast.service";
import { IncidentCalendarComponent } from "./calendar/calendar.component";
import { IncidentSheetService } from "./data/incident-sheet.service";
import { INSIDEN_INCIDENTS_QUERY, type CalendarIncident } from "./data/insiden.queries";
import { IncidentCardComponent } from "./incident-card/incident-card.component";
import { IncidentFormComponent } from "./incident-form/incident-form.component";
import { InsidenPage } from "./insiden.page";
import { LinksSectionComponent } from "./links-section/links-section.component";

interface FormUnderTest {
  model: WritableSignal<{ title: string }>;
}

function incidentFixture(): CalendarIncident {
  return {
    id: "7",
    startDatetime: "2026-08-01T08:00:00Z",
    endDatetime: null,
    severity: "MAJOR",
    title: "KL Sentral flood",
    brief: "Platform 3 underwater",
    details: "",
    hasDetails: false,
    longTerm: false,
    lines: [],
    vehicles: [],
    stations: [],
    categories: [],
    chronologies: [],
    medias: [],
  } as unknown as CalendarIncident;
}

/**
 * The /insiden page mounts the incident form closed, and that form owns its own sheet and an
 * unconditional reference read (every line, vehicle and station). Mounted with the page it ran
 * during SSR and was serialised into TransferState for a sheet most readers never open.
 */
describe("InsidenPage incident sheet hosting", () => {
  let fixture: ComponentFixture<InsidenPage>;
  let httpMock: HttpTestingController;
  let sheet: IncidentSheetService;

  const isReferenceRead = (request: { method: string; body?: { query?: string } }): boolean =>
    request.method === "POST" && (request.body?.query ?? "").includes("InsidenReferenceData");

  function mountedForm() {
    return fixture.debugElement.query(By.directive(IncidentFormComponent));
  }

  /**
   * Opening the sheet resolves its `@defer` block, and the form it renders then starts a reference
   * read that keeps the app unstable until answered — so `whenStable()` cannot come first. Poll for
   * the read (it only exists once the form does), answer it, and let the answer land. Change
   * detection after the open is left to the scheduler on purpose, as in the browser.
   */
  async function settleOpenedSheet(): Promise<void> {
    const reads = await vi.waitFor(
      () => {
        const found = httpMock.match(isReferenceRead);
        if (found.length === 0) throw new Error("the deferred form has not started its read yet");
        return found;
      },
      { timeout: 3000 },
    );
    for (const read of reads) {
      read.flush({ data: { lines: [], stations: [], calendarIncidentCategories: [] } });
    }
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InsidenPage],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            isLoggedIn: () => true,
            isAdmin: () => false,
            user: () => null,
            login: vi.fn(),
            idToken: async () => "token",
          },
        },
        { provide: GraphQLClient, useValue: { request: vi.fn() } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
      ],
    })
      // Chrome, ads and the list/calendar children pull in live services; the sheet hosting is what
      // is under test, so they are stripped and allowed as inert elements.
      .overrideComponent(InsidenPage, {
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
    sheet = TestBed.inject(IncidentSheetService);
  });

  afterEach(() => {
    httpMock.verify();
  });

  /** Mounts the page and answers its own incidents read; the sheet's reads are NOT touched. */
  function mountPage(): void {
    fixture = TestBed.createComponent(InsidenPage);
    fixture.detectChanges();
    TestBed.tick();
    httpMock
      .expectOne((request) => request.body?.query === INSIDEN_INCIDENTS_QUERY)
      .flush({ data: { calendarIncidents: [] } });
  }

  it("creates no incident form, and so no reference read, while the sheet stays closed", async () => {
    mountPage();
    await fixture.whenStable();

    expect(httpMock.match(isReferenceRead)).toHaveLength(0);
    expect(mountedForm()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector("app-incident-form")).toBeNull();
  });

  it("creates the form, sheet and all, when the sheet opens", async () => {
    mountPage();
    await fixture.whenStable();

    sheet.open();
    await settleOpenedSheet();

    expect(mountedForm()).not.toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain("Report an Incident");
  });

  it("creates the form for a sheet that was already open when the page mounted", async () => {
    // The report chooser's "Report an incident" opens the sheet first and navigates here after, so
    // the page's first change detection already sees an open sheet.
    sheet.open();
    mountPage();
    await settleOpenedSheet();

    expect(mountedForm()).not.toBeNull();
  });

  it("hydrates an incident the sheet was opened for before the form existed", async () => {
    // The incident card opens the sheet for an edit; the form is created only after that, so the
    // service has to hold the target until the form's first effect hydrates from it.
    mountPage();
    await fixture.whenStable();

    sheet.open(incidentFixture());
    await settleOpenedSheet();

    const form = mountedForm().componentInstance as unknown as FormUnderTest;
    expect(form.model().title).toBe("KL Sentral flood");
    expect((fixture.nativeElement as HTMLElement).textContent).toContain("Edit Incident");
  });
});
