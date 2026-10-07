import { WritableSignal, provideZonelessChangeDetection, signal } from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient, GraphQLRequestError } from "../../../core/graphql/graphql-client";
import { PreferencesService } from "../../../core/preferences/preferences.service";
import { HlmSheet, HlmSheetBody } from "../../../ui/sheet/sheet";
import { ToastService } from "../../../ui/toast/toast.service";
import { AssetMultiSelectComponent } from "../../insiden/asset-multi-select/asset-multi-select.component";
import { LinePulse } from "../data/home-board.queries";
import { SUBMIT_LINE_STATUS_REPORT_MUTATION } from "../data/home-history.queries";
import { LineStatusSheetService } from "../data/line-status-sheet.service";
import { passengerMetric } from "../data/line-status-metrics.util";
import { LineStatusSheetComponent } from "./line-status-sheet.component";

function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

interface ComponentUnderTest {
  submit(): Promise<void>;
  selectedStationIds: WritableSignal<string[]>;
  notes: WritableSignal<string>;
  delayMinutes: WritableSignal<string>;
  status: WritableSignal<string | null>;
}

function asTestable(fixture: ComponentFixture<LineStatusSheetComponent>): ComponentUnderTest {
  return fixture.componentInstance as unknown as ComponentUnderTest;
}

function makeLine(): LinePulse {
  return {
    id: "line-1",
    code: "KJL",
    displayName: "Kelana Jaya Line",
    displayColor: "#e11d48",
    status: "ACTIVE",
    inServiceVehicleCount: 12,
    totalVehicleCount: 16,
    passengerStatus: "NORMAL",
    passengerStatusMessage: null,
    statusReportCount: 3,
    vehicleStatusCounts: [{ status: "IN_SERVICE", count: 12 }],
    passengerStatusCount: 3,
    statusWindowMinutes: 30,
    pulseLinks: [],
  };
}

describe("LineStatusSheetComponent", () => {
  let fixture: ComponentFixture<LineStatusSheetComponent>;
  let httpMock: HttpTestingController;
  let requestMock: ReturnType<typeof vi.fn>;
  let toastMocks: {
    success: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
  };
  let isLoggedIn: WritableSignal<boolean>;
  let login: ReturnType<typeof vi.fn>;
  let preferences: {
    setLastReportedLine: ReturnType<typeof vi.fn>;
    pushRecentLine: ReturnType<typeof vi.fn>;
  };
  let sheetMock: {
    isOpen: WritableSignal<boolean>;
    lineId: WritableSignal<string | null>;
    presetStatus: WritableSignal<string | null>;
    openFor: ReturnType<typeof vi.fn>;
    setOpen: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    requestMock = vi.fn().mockResolvedValue({ submitLineStatusReport: { ok: true, id: 1 } });
    toastMocks = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
    isLoggedIn = signal(false);
    login = vi.fn();
    preferences = { setLastReportedLine: vi.fn(), pushRecentLine: vi.fn() };
    sheetMock = {
      isOpen: signal(false),
      lineId: signal<string | null>(null),
      presetStatus: signal<string | null>(null),
      openFor: vi.fn(),
      setOpen: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [LineStatusSheetComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: { isLoggedIn, login, idToken: async () => "token" },
        },
        { provide: GraphQLClient, useValue: { request: requestMock } },
        { provide: ToastService, useValue: toastMocks },
        { provide: LineStatusSheetService, useValue: sheetMock },
        { provide: PreferencesService, useValue: preferences },
      ],
    }).compileComponents();

    stubMatchMedia(true);
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(LineStatusSheetComponent);
  });

  afterEach(() => {
    httpMock.verify();
    vi.unstubAllGlobals();
  });

  /* ---- draft-first: the form is NOT behind a login wall ---------------------------------- */

  it("renders the whole form AND the footer while logged out, with a banner not a wall", async () => {
    await openSheetLoggedOut();

    const root = fixture.nativeElement as HTMLElement;
    // The banner says what is missing and what is not: sign in to SUBMIT, not to start.
    expect(root.querySelector('[data-testid="login-button"]')).not.toBeNull();
    expect(
      root
        .querySelector('[data-testid="login-button"]')
        ?.parentElement?.textContent?.replace(/\s+/g, " ")
        .trim(),
    ).toContain("feel free to fill in the details first");
    // …and the form is there to fill in. A reader standing on a platform has already decided to
    // report; making them sign in before they can type anything throws that decision away.
    expect(root.querySelector('[data-testid="status-option-NORMAL"]')).not.toBeNull();
    expect(root.querySelector("form")).not.toBeNull();
    // The footer is unconditional too, so a filled-in report can always be pressed Submit.
    expect(root.querySelector('[data-testid="submit-line-status-report"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="cancel-line-status-report"]')).not.toBeNull();
  });

  it("asks for the account only at submit, and keeps the draft the reader typed", async () => {
    await openSheetLoggedOut();

    const root = fixture.nativeElement as HTMLElement;
    (
      root.querySelector<HTMLButtonElement>('[data-testid="status-option-DELAYED"]') as HTMLElement
    ).click();
    asTestable(fixture).notes.set("Two trains stuck at Angkasapuri");
    asTestable(fixture).delayMinutes.set("12");
    fixture.detectChanges();

    await asTestable(fixture).submit();
    fixture.detectChanges();

    // No request went out, and the sheet is still open with everything in it.
    expect(requestMock).not.toHaveBeenCalled();
    expect(toastMocks.error).toHaveBeenCalledTimes(1);
    const error = submitErrorElement();
    expect(error?.getAttribute("role")).toBe("alert");
    expect(error?.textContent?.replace(/\s+/g, " ")).toContain("log in");
    expect(sheetMock.setOpen).not.toHaveBeenCalled();

    const asTestableAfter = asTestable(fixture);
    expect(asTestableAfter.notes()).toBe("Two trains stuck at Angkasapuri");
    expect(asTestableAfter.delayMinutes()).toBe("12");
    expect(asTestableAfter.status()).toBe("DELAYED");
    // The chosen chip is still rendered as selected, so the reader can see their draft survived.
    expect(
      root.querySelector('[data-testid="status-option-DELAYED"]')?.getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("keeps the draft across the login round-trip", async () => {
    await openSheetLoggedOut();

    const root = fixture.nativeElement as HTMLElement;
    (
      root.querySelector<HTMLButtonElement>('[data-testid="status-option-CROWDED"]') as HTMLElement
    ).click();
    asTestable(fixture).notes.set("Crushed at the door");
    fixture.detectChanges();

    // Press Submit logged out → prompted, nothing sent, nothing cleared.
    await asTestable(fixture).submit();
    // …then the reader signs in from the banner and comes back. Nothing about the OPEN state changed,
    // which is the whole point: the draft is discarded on the open→closed edge only.
    (root.querySelector<HTMLButtonElement>('[data-testid="login-button"]') as HTMLElement).click();
    isLoggedIn.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(login).toHaveBeenCalledTimes(1);
    const afterLogin = asTestable(fixture);
    expect(afterLogin.notes()).toBe("Crushed at the door");
    expect(afterLogin.status()).toBe("CROWDED");
    expect(root.querySelector('[data-testid="login-button"]')).toBeNull();
    // And the now-authorised submit goes through with exactly that draft.
    await afterLogin.submit();
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(requestMock.mock.calls[0][1].input).toMatchObject({
      lineId: "line-1",
      status: "CROWDED",
      notes: "Crushed at the door",
    });
  });

  it("still drops the draft when the sheet actually closes", async () => {
    await openSheetLoggedOut();
    asTestable(fixture).notes.set("temporary");
    fixture.detectChanges();

    sheetMock.isOpen.set(false);
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();

    expect(asTestable(fixture).notes()).toBe("");
  });

  it("submits the mutation with the line, status, stations and auth header", async () => {
    await openSheetWithStations();

    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[data-testid="status-option-CROWDED"]')?.click();
    fixture.detectChanges();
    asTestable(fixture).selectedStationIds.set(["s1"]);

    await asTestable(fixture).submit();

    expect(requestMock).toHaveBeenCalledTimes(1);
    const [mutation, vars, headers] = requestMock.mock.calls[0];
    expect(mutation).toBe(SUBMIT_LINE_STATUS_REPORT_MUTATION);
    expect(vars.input.lineId).toBe("line-1");
    expect(vars.input.status).toBe("CROWDED");
    expect(vars.input.stationIds).toEqual(["s1"]);
    expect(headers).toEqual({ "firebase-auth-key": "token" });
  });

  it("closes the sheet and emits submitted on success", async () => {
    await openSheetWithStations();

    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[data-testid="status-option-NORMAL"]')?.click();
    fixture.detectChanges();
    const emitted = vi.fn();
    fixture.componentInstance.submitted.subscribe(emitted);

    await asTestable(fixture).submit();

    expect(toastMocks.success).toHaveBeenCalledTimes(1);
    expect(sheetMock.setOpen).toHaveBeenCalledWith(false);
    expect(emitted).toHaveBeenCalledTimes(1);
  });

  it("records the reported line as the prefill for next time", async () => {
    await openSheetWithStations();
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="status-option-DELAYED"]')
      ?.click();
    fixture.detectChanges();

    await asTestable(fixture).submit();

    // The chooser orders its picker by pinned → recent → severity, so recording the line HERE is what
    // makes "the line I just reported about" the one at hand next time.
    expect(preferences.setLastReportedLine).toHaveBeenCalledWith("line-1");
    expect(preferences.pushRecentLine).toHaveBeenCalledWith("line-1");
  });

  /* ---- the chooser's preset status ------------------------------------------------------ */

  it("applies a preset status on the open edge, once", async () => {
    // What `LineStatusSheetService.openFor(lineId, { presetStatus: "DISRUPTED" })` leaves behind.
    await openSheetWithPreset("DISRUPTED");

    expect(asTestable(fixture).status()).toBe("DISRUPTED");
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('[data-testid="status-option-DISRUPTED"]')
        ?.getAttribute("aria-checked"),
    ).toBe("true");
    // Consume-once, exactly like the spotting form's line seed: a later seedless open must not
    // resurrect a status from a report that was already submitted.
    expect(sheetMock.presetStatus()).toBeNull();
  });

  it("starts blank when the chooser opened it with no preset", async () => {
    await openSheetWithPreset(null);

    expect(asTestable(fixture).status()).toBeNull();
    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll('[aria-checked="true"]').length,
    ).toBe(0);
  });

  it("lets the reader override the preset before submitting", async () => {
    await openSheetWithStations();
    sheetMock.presetStatus.set("DISRUPTED");
    // A "stopped" report that turns out to be a platform crush is a correction, not a new enum
    // member — so the pre-selection must never be a commitment.
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="status-option-CROWDED"]')
      ?.click();
    fixture.detectChanges();

    await asTestable(fixture).submit();

    expect(requestMock.mock.calls[0][1].input.status).toBe("CROWDED");
  });

  it("does not call the mutation when no status is selected", async () => {
    await openSheetWithStations();

    await asTestable(fixture).submit();

    expect(requestMock).not.toHaveBeenCalled();
    expect(toastMocks.error).toHaveBeenCalledTimes(1);
  });

  it("shows an inline error and keeps the sheet open when the payload reports ok: false", async () => {
    requestMock.mockResolvedValue({ submitLineStatusReport: { ok: false, id: null } });
    await prepareSubmit();
    const emitted = vi.fn();
    fixture.componentInstance.submitted.subscribe(emitted);

    await asTestable(fixture).submit();
    fixture.detectChanges();

    const error = submitErrorElement();
    expect(error).not.toBeNull();
    expect(error?.getAttribute("role")).toBe("alert");
    expect(error?.textContent?.trim()).toBe("Couldn't submit your report. Please try again.");
    expect(toastMocks.success).not.toHaveBeenCalled();
    expect(sheetMock.setOpen).not.toHaveBeenCalled();
    expect(emitted).not.toHaveBeenCalled();
  });

  it("mirrors a GraphQL error message inline and keeps the sheet open", async () => {
    requestMock.mockRejectedValue(new GraphQLRequestError([{ message: "Not authenticated" }]));
    await prepareSubmit();

    await asTestable(fixture).submit();
    fixture.detectChanges();

    expect(submitErrorElement()?.textContent?.trim()).toBe("Not authenticated");
    expect(toastMocks.success).not.toHaveBeenCalled();
    expect(sheetMock.setOpen).not.toHaveBeenCalled();
  });

  it("shows an inline transport error and still rethrows it", async () => {
    requestMock.mockRejectedValue(new Error("Network down"));
    await prepareSubmit();

    await expect(asTestable(fixture).submit()).rejects.toThrow("Network down");
    fixture.detectChanges();

    expect(submitErrorElement()?.textContent?.trim()).toBe(
      "Couldn't reach the server. Check your connection and try again.",
    );
    expect(toastMocks.success).not.toHaveBeenCalled();
    expect(sheetMock.setOpen).not.toHaveBeenCalled();
  });

  it("closes the sheet from Cancel without submitting", async () => {
    await openSheetWithStations();

    const cancel = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="cancel-line-status-report"]',
    );
    expect(cancel).not.toBeNull();
    cancel?.click();

    expect(sheetMock.setOpen).toHaveBeenCalledWith(false);
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("anchors the sheet to the bottom when matchMedia reports a narrow viewport", () => {
    createWithViewport(false);

    expect(sheetSide()).toBe("bottom");
  });

  it("docks the sheet to the right when matchMedia reports a wide viewport", () => {
    createWithViewport(true);

    expect(sheetSide()).toBe("right");
  });

  it("shows the universal-metric help text only once a status is selected", async () => {
    await openSheetWithStations();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('[data-testid="status-help"]')).toBeNull();

    root
      .querySelector<HTMLButtonElement>('[data-testid="status-option-EXTREMELY_CROWDED"]')
      ?.click();
    fixture.detectChanges();

    const help = root.querySelector<HTMLElement>('[data-testid="status-help"]');
    expect(help).not.toBeNull();
    expect(help?.textContent?.trim()).toBe(passengerMetric("EXTREMELY_CROWDED"));
    expect(help?.getAttribute("aria-live")).toBe("polite");

    root.querySelector<HTMLButtonElement>('[data-testid="status-option-NORMAL"]')?.click();
    fixture.detectChanges();
    expect(
      root.querySelector<HTMLElement>('[data-testid="status-help"]')?.textContent?.trim(),
    ).toBe(passengerMetric("NORMAL"));
  });

  it("makes the station list fill the sheet body instead of scrolling it", async () => {
    await openSheetWithStations();
    const root = fixture.nativeElement as HTMLElement;

    const multiSelect = fixture.debugElement.query(By.directive(AssetMultiSelectComponent))
      .componentInstance as AssetMultiSelectComponent;
    expect(multiSelect.fillHeight()).toBe(true);

    const body = fixture.debugElement.query(By.directive(HlmSheetBody))
      .componentInstance as HlmSheetBody;
    expect(body.scrollable()).toBe(false);

    const form = root.querySelector<HTMLFormElement>("form");
    expect(form?.classList.contains("flex-1")).toBe(true);
    expect(form?.classList.contains("min-h-0")).toBe(true);

    const host = root.querySelector<HTMLElement>("app-asset-multi-select");
    expect(host?.classList.contains("flex-1")).toBe(true);
    expect(host?.classList.contains("min-h-0")).toBe(true);
    expect(host?.classList.contains("flex-col")).toBe(true);

    const list = root.querySelector<HTMLElement>('[data-testid="asset-option-list"]');
    expect(list?.classList.contains("flex-1")).toBe(true);
    expect(list?.classList.contains("max-h-none")).toBe(true);
    expect(list?.classList.contains("max-h-44")).toBe(false);
  });

  function createWithViewport(matches: boolean): void {
    stubMatchMedia(matches);
    fixture = TestBed.createComponent(LineStatusSheetComponent);
    fixture.detectChanges();
  }

  function sheetSide(): string {
    const sheetDebug = fixture.debugElement.query(By.directive(HlmSheet));
    return (sheetDebug.componentInstance as HlmSheet).side();
  }

  function submitErrorElement(): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '[data-testid="line-status-submit-error"]',
    );
  }

  /** Opens the sheet on a line with a status picked, ready for a `submit()` call. */
  async function prepareSubmit(): Promise<void> {
    await openSheetWithStations();
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="status-option-NORMAL"]')
      ?.click();
    fixture.detectChanges();
  }

  /** Logs in, targets a line, opens the sheet and flushes the lazily loaded station list. */
  async function openSheetWithStations(): Promise<void> {
    isLoggedIn.set(true);
    fixture.componentRef.setInput("line", makeLine());
    sheetMock.isOpen.set(true);
    fixture.detectChanges();

    const stationsRequest = httpMock.expectOne(
      (r) => r.method === "POST" && r.body.query.includes("StationLinesByLine"),
    );
    stationsRequest.flush({
      data: {
        stationLines: [
          { id: "s1", displayName: "KL Sentral", internalRepresentation: "KLS" },
          { id: "s2", displayName: "Subang Jaya", internalRepresentation: "SBJ" },
        ],
      },
    });
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /**
   * Opens the sheet LOGGED OUT on a known line, and flushes the lazy station read the sheet fires
   * the moment it knows its line — an unflushed request would fail `httpMock.verify()` for a reason
   * that has nothing to do with the behaviour under test.
   */
  async function openSheetLoggedOut(): Promise<void> {
    fixture.componentRef.setInput("line", makeLine());
    sheetMock.isOpen.set(true);
    fixture.detectChanges();
    httpMock
      .expectOne((r) => r.method === "POST" && r.body.query.includes("StationLinesByLine"))
      .flush({ data: { stationLines: [] } });
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /**
   * The chooser's own open path: the service already holds the line AND (maybe) a preset status
   * before the sheet renders. The station list still has to be flushed, or `httpMock.verify()` in
   * afterEach fails on an outstanding request — the sheet's lazy resource does not care who opened it.
   */
  async function openSheetWithPreset(presetStatus: string | null): Promise<void> {
    isLoggedIn.set(true);
    fixture.componentRef.setInput("line", makeLine());
    sheetMock.lineId.set("line-1");
    sheetMock.presetStatus.set(presetStatus);
    sheetMock.isOpen.set(true);
    fixture.detectChanges();

    const stationsRequest = httpMock.expectOne(
      (r) => r.method === "POST" && r.body.query.includes("StationLinesByLine"),
    );
    stationsRequest.flush({ data: { stationLines: [] } });
    await fixture.whenStable();
    fixture.detectChanges();
    // The preset lives on the OPEN edge, which is an effect flush — one tick past the first render.
    TestBed.tick();
    fixture.detectChanges();
  }
});
