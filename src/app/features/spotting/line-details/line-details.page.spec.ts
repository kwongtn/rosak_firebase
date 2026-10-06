import { ComponentFixture, TestBed } from "@angular/core/testing";
import { LineDetailsPage } from "./line-details.page";
import { provideRouter } from "@angular/router";
import { provideZonelessChangeDetection } from "@angular/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpottingLinesStore } from "../data/spotting-lines.store";
import { provideHttpClientTesting, HttpTestingController } from "@angular/common/http/testing";

const LINE = { id: "1", code: "L1", displayName: "Line 1", status: "ACTIVE" as const };
const VEHICLE_TYPE = {
  id: "t1",
  internalName: "T1",
  displayName: "Type One",
  vehicleStatusInServiceCount: 16,
  vehicleStatusNotSpottedCount: 0,
  vehicleStatusOutOfServiceCount: 0,
  vehicleStatusDecommissionedCount: 0,
  vehicleStatusMarriedCount: 0,
  vehicleStatusTestingCount: 0,
  vehicleStatusUnknownCount: 0,
  vehicleTotalCount: 16,
  vehicles: [],
};

function rectAt(y: number): DOMRect {
  return {
    x: 0,
    y,
    top: y,
    left: 0,
    bottom: y + 100,
    right: 390,
    width: 390,
    height: 100,
    toJSON: () => ({}),
  } as DOMRect;
}

class FakeResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

describe("LineDetailsPage (mobile activity bar)", () => {
  let fixture: ComponentFixture<LineDetailsPage>;
  let component: LineDetailsPage;
  let httpMock: HttpTestingController;
  let rectSpy: ReturnType<typeof vi.spyOn>;

  async function drain(): Promise<void> {
    for (let i = 0; i < 10; i++) {
      TestBed.tick();
      const pending = httpMock.match(() => true);
      if (pending.length === 0) break;
      pending.forEach((r) => {
        const q = String(r.request.body?.query ?? "");
        if (r.request.method === "GET") {
          r.flush([]);
          return;
        }
        if (q.includes("VehicleTypesByLine")) {
          r.flush({ data: { vehicleTypes: [VEHICLE_TYPE] } });
          return;
        }
        if (q.includes("LineSpottingBounds")) {
          r.flush({ data: { lines: [{ id: "1", vehicleSpottingTrends: [] }] } });
          return;
        }
        if (q.includes("LineSpottingGrid")) {
          r.flush({ data: { lines: [{ id: "1", vehicleSpottingTrends: [] }] } });
          return;
        }
        r.flush({ data: {} });
      });
      fixture.detectChanges();
      TestBed.tick();
    }
  }

  async function render(mobile: boolean): Promise<void> {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    stubMatchMedia(!mobile);
    rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(rectAt(500));

    await TestBed.configureTestingModule({
      imports: [LineDetailsPage],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: SpottingLinesStore, useValue: { lineById: () => LINE } },
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(LineDetailsPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput("lineId", "1");
    fixture.detectChanges();
    TestBed.tick();
    await drain();
    fixture.detectChanges();
  }

  afterEach(() => {
    httpMock
      .match(() => true)
      .forEach((r) => {
        r.flush(r.request.method === "GET" ? [] : { data: {} });
      });
    httpMock.verify();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("hides enriched content when not pinned, shows when pinned", async () => {
    await render(true);

    const host = fixture.nativeElement as HTMLElement;
    const codeSpan = host.querySelector(
      '[data-testid="details-activity-line-code"]',
    ) as HTMLElement;
    const identity = host.querySelector('[data-testid="details-activity-identity"]') as HTMLElement;
    expect(codeSpan?.classList.contains("hidden")).toBe(true);
    expect(identity?.classList.contains("hidden")).toBe(true);

    rectSpy.mockReturnValue(rectAt(61));
    window.dispatchEvent(new Event("scroll"));
    fixture.detectChanges();

    expect(codeSpan?.classList.contains("hidden")).toBe(false);
    expect(identity?.classList.contains("hidden")).toBe(false);

    rectSpy.mockReturnValue(rectAt(700));
    window.dispatchEvent(new Event("scroll"));
    fixture.detectChanges();

    expect(codeSpan?.classList.contains("hidden")).toBe(true);
    expect(identity?.classList.contains("hidden")).toBe(true);
  });

  it("shows chip text when pinned", async () => {
    await render(true);

    rectSpy.mockReturnValue(rectAt(61));
    window.dispatchEvent(new Event("scroll"));
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const identity = host.querySelector('[data-testid="details-activity-identity"]');
    expect(identity?.textContent).toContain("16/16 In Service");
  });

  it("desktop: does not blank the plain title when pinned state flips", async () => {
    await render(false);

    const host = fixture.nativeElement as HTMLElement;
    const plain = host.querySelector('[data-testid="details-activity-title-plain"]') as HTMLElement;
    expect(plain?.classList.contains("hidden")).toBe(false);

    rectSpy.mockReturnValue(rectAt(61));
    window.dispatchEvent(new Event("scroll"));
    fixture.detectChanges();
    expect(plain?.classList.contains("hidden")).toBe(false);
    expect(plain?.textContent).toContain("Spotting Activity");
  });
});
