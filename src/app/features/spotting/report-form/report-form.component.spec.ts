import { WritableSignal, provideZonelessChangeDetection, signal } from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient } from "../../../core/graphql/graphql-client";
import { ImageUploadService } from "../../../core/upload/image-upload.service";
import { ToastService } from "../../../ui/toast/toast.service";
import { ReportSheetService } from "../data/report-sheet.service";
import { SpottingLinesStore } from "../data/spotting-lines.store";
import type { Line } from "../data/spotting.queries";
import { ReportFormComponent } from "./report-form.component";
import type { ReportFormModel } from "./report-form.schema";

interface ComponentUnderTest {
  model: WritableSignal<ReportFormModel>;
}

const SEEDED_LINE: Line = {
  id: "4",
  code: "KJL",
  displayName: "Kelana Jaya Line",
  status: "ACTIVE",
};

const SEEDED_STATION = { id: "s1", displayName: "KLCC", internalRepresentation: "KLCC" };

describe("ReportFormComponent", () => {
  let fixture: ComponentFixture<ReportFormComponent>;
  let httpMock: HttpTestingController;
  let sheet: ReportSheetService;
  let storeLines: WritableSignal<Line[]>;

  function model(): ReportFormModel {
    return (fixture.componentInstance as unknown as ComponentUnderTest).model();
  }

  /** Lets the pending sheet-edge effect run and the re-rendered DOM settle. */
  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** A station-relevant write (`lineId`/`type`) re-issues the station resource's fetch, so
   * `settle()` alone would block on that in-flight request forever. Flush it, then settle: the
   * flushed response lands on the microtask queue, so a bare `detectChanges()` would still
   * render the pre-flush option list. Unrelated writes (notes/status) no longer re-issue it —
   * the requestFn reads projected `lineId`/`type` computeds, not the whole model. */
  async function flushStationLines(): Promise<void> {
    fixture.detectChanges();
    for (const request of httpMock.match(
      (r) => r.method === "POST" && r.body.query.includes("StationLinesByLine"),
    )) {
      request.flush({ data: { stationLines: [SEEDED_STATION] } });
    }
    await settle();
  }

  beforeEach(async () => {
    storeLines = signal<Line[]>([]);
    await TestBed.configureTestingModule({
      imports: [ReportFormComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClientTesting(),
        { provide: SpottingLinesStore, useValue: { lines: storeLines } },
        {
          provide: AuthService,
          useValue: { isLoggedIn: signal(false), login: vi.fn(), idToken: async () => "token" },
        },
        { provide: GraphQLClient, useValue: { request: vi.fn() } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
        { provide: ImageUploadService, useValue: { addToQueue: vi.fn() } },
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    sheet = TestBed.inject(ReportSheetService);
    fixture = TestBed.createComponent(ReportFormComponent);
    fixture.detectChanges();

    const linesRequest = httpMock.expectOne(
      (r) => r.method === "POST" && r.body.query.includes("LinesAndVehicles"),
    );
    linesRequest.flush({ data: { lines: [] } });
    await settle();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it("seeds the model's lineId when opened with a line via openFor", async () => {
    sheet.openFor("4");
    await settle();

    expect(model().lineId).toBe("4");
    // The seed is one-shot — consumed on the open edge so a later plain open() cannot
    // resurrect the line from this unrelated open.
    expect(sheet.lineId()).toBeNull();
    // Signal Forms reflects the model update: the vehicle picker (gated on a selected
    // line) is now rendered.
    expect((fixture.nativeElement as HTMLElement).textContent).toContain("Vehicle");
  });

  it("starts blank when opened without a seed", async () => {
    sheet.open();
    await settle();

    expect(model().lineId).toBe("");
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain("Vehicle");
  });

  it("clears the draft on close, and a later unseeded open stays blank", async () => {
    sheet.openFor("4");
    await settle();
    expect(model().lineId).toBe("4");

    sheet.setOpen(false);
    await settle();
    expect(model().lineId).toBe("");

    sheet.open();
    await settle();
    expect(model().lineId).toBe("");
  });

  it("opens with the seeded line selected and the Line picker closed", async () => {
    storeLines.set([SEEDED_LINE]);
    sheet.openFor("4");
    await settle();

    const root = fixture.nativeElement as HTMLElement;
    const input = root.querySelector<HTMLInputElement>("hlm-combobox input");
    expect(model().lineId).toBe("4");
    expect(input?.value).toContain("KJL");
    expect(root.textContent).toContain("Vehicle");

    // jsdom has no layout, so HlmSheet's CDK focus trap cannot run its own focus() call here;
    // dispatch the exact focus event it fires at the first field on open instead.
    input?.dispatchEvent(new FocusEvent("focus"));
    fixture.detectChanges();
    expect(root.querySelectorAll("hlm-combobox ul li").length).toBe(0);

    // The field is still usable: a real click opens the picker.
    input?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    fixture.detectChanges();
    expect(root.querySelectorAll("hlm-combobox ul li").length).toBe(1);
  });

  it("clears the form's lineId when the line combobox text is emptied", async () => {
    storeLines.set([SEEDED_LINE]);
    sheet.openFor("4");
    await settle();
    expect(model().lineId).toBe("4");

    const root = fixture.nativeElement as HTMLElement;
    const input = root.querySelector<HTMLInputElement>("hlm-combobox input");
    if (!input) throw new Error("line combobox input not rendered");
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();

    // The old id must not survive in the model — keeping it is what made the field
    // "reselect itself" on blur while still submitting the cleared vehicle.
    expect(model().lineId ?? "").toBe("");
    // The vehicle picker is gated on a selected line, so it goes away with it.
    expect(root.textContent).not.toContain("Vehicle");
  });

  it("renders the station placeholder as a usable (non-disabled) option", async () => {
    storeLines.set([SEEDED_LINE]);
    sheet.openFor("4");
    await settle();

    (fixture.componentInstance as unknown as ComponentUnderTest).model.update((m) => ({
      ...m,
      type: "AT_STATION",
    }));
    await flushStationLines();

    const root = fixture.nativeElement as HTMLElement;
    const stationSelect = Array.from(root.querySelectorAll<HTMLSelectElement>("select")).find(
      (select) =>
        Array.from(select.options).some((o) => o.textContent?.trim() === "Select a station"),
    );
    if (!stationSelect) throw new Error("station select not rendered");

    // A disabled placeholder is rejected by the browser, leaving the old station stuck.
    expect(stationSelect.options[0].disabled).toBe(false);

    stationSelect.value = "s1";
    stationSelect.dispatchEvent(new Event("input", { bubbles: true }));
    stationSelect.dispatchEvent(new Event("change", { bubbles: true }));
    await flushStationLines();
    expect(model().atStation).toBe("s1");

    stationSelect.value = "";
    stationSelect.dispatchEvent(new Event("input", { bubbles: true }));
    stationSelect.dispatchEvent(new Event("change", { bubbles: true }));
    await flushStationLines();
    expect(model().atStation).toBe("");
  });

  it("re-issues the station query on a lineId/type change, but not on unrelated model writes", async () => {
    storeLines.set([SEEDED_LINE]);
    sheet.openFor("4");
    await settle();

    const component = fixture.componentInstance as unknown as ComponentUnderTest;
    component.model.update((m) => ({ ...m, type: "AT_STATION" }));
    await flushStationLines();

    // The reported refetch storm: a Notes keystroke used to re-issue StationLinesByLine because
    // the requestFn read the whole model. An unrelated write must now trigger nothing.
    component.model.update((m) => ({ ...m, notes: "a" }));
    await settle();
    expect(
      httpMock.match((r) => r.method === "POST" && r.body.query.includes("StationLinesByLine")),
    ).toHaveLength(0);

    // A type change is still a real dependency and must refetch.
    component.model.update((m) => ({ ...m, type: "BETWEEN_STATIONS" }));
    fixture.detectChanges();
    const refetched = httpMock.match(
      (r) => r.method === "POST" && r.body.query.includes("StationLinesByLine"),
    );
    expect(refetched.length).toBeGreaterThan(0);
    for (const request of refetched) {
      request.flush({ data: { stationLines: [SEEDED_STATION] } });
    }
    await settle();
  });
});
