import { WritableSignal, provideZonelessChangeDetection, signal } from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient } from "../../../core/graphql/graphql-client";
import { HlmSheet, HlmSheetBody } from "../../../ui/sheet/sheet";
import { ToastService } from "../../../ui/toast/toast.service";
import { AssetMultiSelectComponent } from "../../insiden/asset-multi-select/asset-multi-select.component";
import { LinePulse, SUBMIT_LINE_STATUS_REPORT_MUTATION } from "../data/home.queries";
import { LineStatusSheetService } from "../data/line-status-sheet.service";
import { passengerMetric } from "../data/line-status-metrics.util";
import { LineStatusSheetComponent } from "./line-status-sheet.component";

function stubMatchMedia(matches: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

interface ComponentUnderTest {
  submit(): Promise<void>;
  selectedStationIds: WritableSignal<string[]>;
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
  let sheetMock: {
    isOpen: WritableSignal<boolean>;
    lineId: WritableSignal<string | null>;
    openFor: ReturnType<typeof vi.fn>;
    setOpen: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    requestMock = vi.fn().mockResolvedValue({ submitLineStatusReport: { ok: true, id: 1 } });
    toastMocks = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
    isLoggedIn = signal(false);
    sheetMock = {
      isOpen: signal(false),
      lineId: signal<string | null>(null),
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
          useValue: { isLoggedIn, login: vi.fn(), idToken: async () => "token" },
        },
        { provide: GraphQLClient, useValue: { request: requestMock } },
        { provide: ToastService, useValue: toastMocks },
        { provide: LineStatusSheetService, useValue: sheetMock },
      ],
    }).compileComponents();

    stubMatchMedia(true);
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(LineStatusSheetComponent);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it("shows the login button and no form when logged out", async () => {
    sheetMock.isOpen.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="login-button"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="submit-line-status-report"]')).toBeNull();
    expect(root.querySelector('[data-testid="status-option-NORMAL"]')).toBeNull();
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

  it("does not call the mutation when no status is selected", async () => {
    await openSheetWithStations();

    await asTestable(fixture).submit();

    expect(requestMock).not.toHaveBeenCalled();
    expect(toastMocks.error).toHaveBeenCalledTimes(1);
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
});
