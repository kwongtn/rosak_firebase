import { PLATFORM_ID, provideZonelessChangeDetection, signal } from "@angular/core";
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { Router, provideRouter } from "@angular/router";
import { toastState } from "@spartan-ng/brain/sonner";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ImageUploadService } from "../../../core/upload/image-upload.service";
import { ToastService } from "../../../ui/toast/toast.service";
import { SpottingLinesStore } from "../data/spotting-lines.store";
import type { SpottingEvent, VehicleHeader, VehicleRow } from "../data/spotting.queries";
import { VehicleDetailPage } from "./vehicle-detail.page";

const LINE = { id: "4", code: "KJL", displayName: "Kelana Jaya Line", status: "ACTIVE" as const };

function makeHeader(id: string, identificationNo: string): VehicleHeader {
  return {
    id,
    identificationNo,
    status: "IN_SERVICE",
    nickname: null,
    lastSpottingDate: "2026-10-01",
    inServiceSince: "2016-01-01",
    spottingCount: 7,
    notes: "",
    incidentCount: 1,
    wheelStatus: null,
  };
}

const HEADER_103 = makeHeader("103", "01 (Old)");
const HEADER_104 = makeHeader("104", "02");

/** What the line roster returns: two vehicles, deliberately out of order. */
const ROSTER = {
  vehicleTypes: [
    {
      id: "t1",
      vehicles: [
        { ...HEADER_104, lastSpottedAt: null },
        { ...HEADER_103, lastSpottedAt: null },
      ] satisfies VehicleRow[],
    },
  ],
};

const INCIDENT = {
  order: 1,
  date: "2026-09-01",
  severity: "STATUS",
  title: "Door fault",
  brief: "Door stuck open",
  isLast: true,
};

const EVENT: SpottingEvent = {
  id: "e1",
  spottingDate: "2026-10-01",
  status: "IN_SERVICE",
  type: "JUST_SPOTTING",
  notes: "Seen near KLCC",
  runNumber: null,
  mediaCount: 0,
  isMine: false,
  wheelStatus: null,
  originStation: null,
  destinationStation: null,
};

const OPERATION = /query (\w+)/;

describe("VehicleDetailPage", () => {
  let fixture: ComponentFixture<VehicleDetailPage>;
  let httpMock: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };

  /** `realToast` swaps the ToastService stub for the real one, for the one behaviour a stub
   * cannot show: raising a toast reads and rewrites the shared toast list. */
  async function render(
    options: { platform?: "browser" | "server"; realToast?: boolean } = {},
  ): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [VehicleDetailPage],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: PLATFORM_ID, useValue: options.platform ?? "browser" },
        { provide: SpottingLinesStore, useValue: { lineById: () => LINE } },
        ...(options.realToast ? [] : [{ provide: ToastService, useValue: toast }]),
        { provide: ImageUploadService, useValue: { pendingCount: signal(0) } },
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true);
    fixture = TestBed.createComponent(VehicleDetailPage);
    fixture.componentRef.setInput("lineId", "4");
    fixture.componentRef.setInput("vehicleId", "103");
    tick();
  }

  function tick(): void {
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
  }

  /** Lets flushed responses reach the signal graph, then re-renders. A bare `whenStable()` would
   * wait forever on the requests a test deliberately leaves unanswered. */
  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
    tick();
  }

  /** Takes (and returns) the pending requests for one GraphQL operation. */
  function take(operation: string): TestRequest[] {
    return httpMock.match(
      (r) => r.method === "POST" && OPERATION.exec(r.body.query)?.[1] === operation,
    );
  }

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => {
    fixture.destroy();
    // Whatever the destroyed page left in flight is cancelled; dropping it keeps verify() honest.
    httpMock.match(() => true);
    httpMock.verify();
    vi.clearAllMocks();
    toastState.reset();
  });

  it("sends the header, activity, timeline and history queries together, before any response", async () => {
    await render();

    const operations = httpMock
      .match(() => true)
      .map((r) => OPERATION.exec(r.request.body.query)?.[1]);

    expect(operations).toEqual(
      expect.arrayContaining([
        "VehicleHeader",
        "VehicleSpottingHistory",
        "VehicleIncidentsByVehicle",
        "VehicleEvents",
      ]),
    );
  });

  it("shows the timeline and history loading states at once, not after the header", async () => {
    await render();

    expect(root().querySelector("h1")).toBeNull();
    expect(root().querySelector("app-incident-timeline")?.textContent).toContain("Loading");
    expect(root().querySelector("app-spotting-history [hlmskeleton]")).not.toBeNull();
  });

  it("renders the header and status board from the single-vehicle query, not the roster", async () => {
    await render();

    const [header] = take("VehicleHeader");
    expect(header.request.body.variables).toEqual({ vehicleId: "103" });
    header.flush({ data: { vehicles: [HEADER_103] } });
    await settle();

    expect(root().querySelector("h1")?.textContent).toContain("01 (Old)");
    expect(root().querySelector("app-vehicle-status-board")?.textContent).toContain(
      "Times Spotted",
    );
    // The roster was never answered: nothing about the header waited for it.
    expect(take("VehicleTypesByLine")).toHaveLength(1);
  });

  it("renders the timeline and history before the header or the roster answer", async () => {
    await render();

    take("VehicleIncidentsByVehicle")[0].flush({ data: { vehicleIncidents: [INCIDENT] } });
    take("VehicleEvents")[0].flush({ data: { events: [EVENT] } });
    await settle();

    expect(root().querySelector("h1")).toBeNull();
    expect(root().querySelector("div.gap-4 > [hlmskeleton].w-48")).not.toBeNull();
    expect(root().querySelector("app-incident-timeline")?.textContent).toContain("Door fault");
    expect(root().querySelector("app-spotting-history")?.textContent).toContain("Seen near KLCC");
  });

  it("labels the vehicle switcher and fills it from the roster once that arrives", async () => {
    await render();
    take("VehicleHeader")[0].flush({ data: { vehicles: [HEADER_103] } });
    await settle();

    const input = root().querySelector<HTMLInputElement>("hlm-combobox input");
    if (!input) throw new Error("vehicle switcher not rendered");
    expect(input.getAttribute("aria-label")).toBe("Switch vehicle");
    // No roster yet: the switcher already shows the current vehicle rather than an empty field.
    expect(input.value).toBe("01 (Old)");
    input.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    tick();
    expect(root().querySelectorAll("hlm-combobox ul li")).toHaveLength(1);

    take("VehicleTypesByLine")[0].flush({ data: ROSTER });
    await settle();

    const labels = Array.from(root().querySelectorAll("hlm-combobox ul li")).map((li) =>
      li.textContent?.trim().replace(/\s+/g, " "),
    );
    expect(labels).toHaveLength(2);
    expect(labels[0]).toContain("01 (Old)");
    expect(labels[1]).toContain("02");
  });

  it("does not request the line roster on the server", async () => {
    await render({ platform: "server" });

    const operations = httpMock
      .match(() => true)
      .map((r) => OPERATION.exec(r.request.body.query)?.[1]);

    expect(operations).toContain("VehicleHeader");
    expect(operations).not.toContain("VehicleTypesByLine");
  });

  it("redirects to the line, with no timeline or history, when the vehicle does not exist", async () => {
    await render();

    take("VehicleHeader")[0].flush({ data: { vehicles: [] } });
    await settle();

    expect(toast.error).toHaveBeenCalledWith("Vehicle not found", expect.any(String));
    expect(navigate).toHaveBeenCalledWith(["/spotting", "4"], { replaceUrl: true });
    expect(root().querySelector("app-incident-timeline")).toBeNull();
    expect(root().querySelector("app-spotting-history")).toBeNull();
    expect(root().querySelector("div.gap-4 > [hlmskeleton].w-48")).toBeNull();
  });

  it("raises the not-found toast once, instead of re-running its own effect forever", async () => {
    await render({ realToast: true });

    take("VehicleHeader")[0].flush({ data: { vehicles: [] } });
    await settle();
    await settle();

    expect(toastState.toasts()).toHaveLength(1);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("shows the retry banner, with no timeline or history, when the header query fails", async () => {
    await render();

    take("VehicleHeader")[0].flush({ errors: [{ message: "boom" }] });
    await settle();

    expect(root().textContent).toContain("Couldn't load this vehicle.");
    expect(root().querySelector("app-incident-timeline")).toBeNull();
    expect(root().querySelector("app-spotting-history")).toBeNull();
    expect(toast.error).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("shows the header skeleton, not a not-found redirect, while the next vehicle loads", async () => {
    await render();
    take("VehicleHeader")[0].flush({ data: { vehicles: [HEADER_103] } });
    await settle();
    expect(root().querySelector("h1")?.textContent).toContain("01 (Old)");

    fixture.componentRef.setInput("vehicleId", "104");
    tick();

    expect(root().querySelector("h1")).toBeNull();
    expect(root().querySelector("div.gap-4 > [hlmskeleton].w-48")).not.toBeNull();
    expect(toast.error).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();

    const [next] = take("VehicleHeader");
    expect(next.request.body.variables).toEqual({ vehicleId: "104" });
    next.flush({ data: { vehicles: [HEADER_104] } });
    await settle();
    expect(root().querySelector("h1")?.textContent).toContain("02");
  });
});
