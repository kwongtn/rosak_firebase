import { WritableSignal, provideZonelessChangeDetection, signal } from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient } from "../../../core/graphql/graphql-client";
import { ToastService } from "../../../ui/toast/toast.service";
import { LinePulse, SUBMIT_LINE_STATUS_REPORT_MUTATION } from "../data/home.queries";
import { LineStatusSheetService } from "../data/line-status-sheet.service";
import { LineStatusSheetComponent } from "./line-status-sheet.component";

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
