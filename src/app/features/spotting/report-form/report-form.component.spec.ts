import { WritableSignal, provideZonelessChangeDetection, signal } from "@angular/core";
import { HttpErrorResponse } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient, GraphQLRequestError } from "../../../core/graphql/graphql-client";
import { ImageUploadService } from "../../../core/upload/image-upload.service";
import { ToastService } from "../../../ui/toast/toast.service";
import { ReportSheetService } from "../data/report-sheet.service";
import { SpottingLinesStore } from "../data/spotting-lines.store";
import type { Line } from "../data/spotting.queries";
import { ReportFormComponent } from "./report-form.component";
import { REPORT_FORM_DRAFT_KEY, serializeReportFormDraft } from "./report-form-draft.util";
import { emptyReportFormModel, type ReportFormModel } from "./report-form.schema";

interface ComponentUnderTest {
  model: WritableSignal<ReportFormModel>;
  capturedLocation: WritableSignal<GeolocationCoordinates | null>;
}

/** What `navigator.geolocation` hands back: every field the browser reports, including the ones
 * the form must not send on. */
const CAPTURED_COORDS = {
  accuracy: 12,
  latitude: 3.1579,
  longitude: 101.7116,
  altitude: 55,
  altitudeAccuracy: 4,
  heading: 90,
  speed: 3,
} as GeolocationCoordinates;

const SEEDED_LINE: Line = {
  id: "4",
  code: "KJL",
  displayName: "Kelana Jaya Line",
  status: "ACTIVE",
};

const SEEDED_FLEET_LINE = {
  id: "4",
  code: "KJL",
  displayName: "Kelana Jaya Line",
  vehicleTypes: [
    {
      id: "vt1",
      internalName: "KJ Fleet",
      displayName: "KJ Fleet",
      vehicles: [{ id: "v1", identificationNo: "1-234", status: "OUT_OF_SERVICE" as const }],
    },
  ],
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
          useValue: {
            isLoggedIn: signal(false),
            user: signal(null),
            login: vi.fn(),
            idToken: async () => "token",
          },
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
    linesRequest.flush({ data: { lines: [SEEDED_FLEET_LINE] } });
    await settle();
  });

  afterEach(() => {
    httpMock.verify();
    // The form saves its draft to sessionStorage, which outlives a test inside this file.
    sessionStorage.clear();
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

  describe("draft persistence", () => {
    function component(): ComponentUnderTest & { submit(): Promise<void>; clear(): void } {
      return fixture.componentInstance as unknown as ComponentUnderTest & {
        submit(): Promise<void>;
        clear(): void;
      };
    }

    function savedDraft(): Record<string, unknown> | null {
      const raw = sessionStorage.getItem(REPORT_FORM_DRAFT_KEY);
      return raw === null ? null : (JSON.parse(raw) as Record<string, unknown>);
    }

    function restoredLine(): HTMLElement | null {
      return (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
        '[data-testid="report-form-draft-restored"]',
      );
    }

    function saveDraft(fields: Partial<ReportFormModel>, photoCount = 0): void {
      sessionStorage.setItem(
        REPORT_FORM_DRAFT_KEY,
        serializeReportFormDraft({ ...emptyReportFormModel(), ...fields }, photoCount),
      );
    }

    it("saves the draft while open, keeps it through a close, and restores it on the next open", async () => {
      sheet.open();
      await settle();
      expect(restoredLine()).toBeNull();

      component().model.update((m) => ({ ...m, lineId: "4" }));
      await settle();
      component().model.update((m) => ({
        ...m,
        vehicleId: "v1",
        notes: "Screeching on the curve",
      }));
      await settle();
      expect(savedDraft()).toMatchObject({
        lineId: "4",
        vehicleId: "v1",
        notes: "Screeching on the curve",
      });

      // An accidental close (backdrop, Escape, a swipe) resets the form but not the saved draft.
      sheet.setOpen(false);
      await settle();
      expect(model().notes).toBe("");
      expect(savedDraft()).toMatchObject({ notes: "Screeching on the curve" });

      sheet.open();
      await settle();
      expect(model()).toMatchObject({
        lineId: "4",
        vehicleId: "v1",
        notes: "Screeching on the curve",
      });
      expect(restoredLine()?.textContent?.replace(/\s+/g, " ").trim()).toBe(
        "Draft restored. Discard",
      );
    });

    it("forgets the saved draft on Discard and hands focus to the Line picker", async () => {
      saveDraft({ lineId: "4", notes: "Saved earlier" });
      sheet.open();
      await settle();
      expect(model().notes).toBe("Saved earlier");

      const root = fixture.nativeElement as HTMLElement;
      root.querySelector<HTMLButtonElement>('[data-testid="report-form-draft-discard"]')?.click();
      await settle();

      expect(savedDraft()).toBeNull();
      expect(model().lineId).toBe("");
      expect(model().notes).toBe("");
      expect(restoredLine()).toBeNull();
      expect(document.activeElement).toBe(root.querySelector("hlm-combobox input"));
    });

    it("keeps another account's draft hidden, and saved, until this page knows who is signed in", async () => {
      // The draft's owner signed out in another tab while this one was unloaded (see
      // `claimSessionDrafts`, which AuthService runs on every auth state change).
      sessionStorage.setItem("rosak:draft-owner", "someone-else");
      saveDraft({ lineId: "4", notes: "Someone else's notes" });

      sheet.open();
      await settle();

      expect(model().notes).toBe("");
      expect(restoredLine()).toBeNull();
      expect(savedDraft()).toMatchObject({ notes: "Someone else's notes" });
    });

    it("asks for the photos again when the restored draft had some", async () => {
      saveDraft({ notes: "With photos" }, 2);
      sheet.open();
      await settle();

      expect(restoredLine()?.textContent).toContain(
        "Photos aren't saved with a draft, so add them again.",
      );
    });

    it("leaves a draft for another line saved when a line-seeded open is for a different line", async () => {
      saveDraft({ lineId: "7", notes: "For line 7" });

      sheet.openFor("4");
      await settle();
      expect(model().lineId).toBe("4");
      expect(model().notes).toBe("");
      expect(restoredLine()).toBeNull();
      expect(savedDraft()).toMatchObject({ lineId: "7", notes: "For line 7" });

      // A later open without a seed is where that draft comes back.
      sheet.setOpen(false);
      await settle();
      sheet.open();
      await settle();
      expect(model()).toMatchObject({ lineId: "7", notes: "For line 7" });
    });

    it("restores a draft for the seeded line", async () => {
      saveDraft({ lineId: "4", notes: "Same line" });

      sheet.openFor("4");
      await settle();

      expect(model()).toMatchObject({ lineId: "4", notes: "Same line" });
      expect(restoredLine()).not.toBeNull();
    });

    it("saves nothing for an open the rider has not touched", async () => {
      sheet.openFor("4");
      await settle();

      expect(savedDraft()).toBeNull();
    });

    it("removes a draft it wrote once the rider undoes every change", async () => {
      sheet.open();
      await settle();
      component().model.update((m) => ({ ...m, notes: "typo" }));
      await settle();
      expect(savedDraft()).not.toBeNull();

      component().model.update((m) => ({ ...m, notes: "" }));
      await settle();

      expect(savedDraft()).toBeNull();
    });

    it("forgets the saved draft on Clear form", async () => {
      sheet.open();
      await settle();
      component().model.update((m) => ({ ...m, notes: "about to clear" }));
      await settle();
      expect(savedDraft()).not.toBeNull();

      component().clear();
      await settle();
      expect(savedDraft()).toBeNull();

      sheet.setOpen(false);
      await settle();
      sheet.open();
      await settle();
      expect(model().notes).toBe("");
      expect(restoredLine()).toBeNull();
    });

    it("forgets the saved draft after a successful submit", async () => {
      (TestBed.inject(AuthService).isLoggedIn as unknown as WritableSignal<boolean>).set(true);
      vi.mocked(TestBed.inject(GraphQLClient).request).mockResolvedValueOnce({
        addEvent: { id: 1 },
      });
      sheet.openFor("4");
      await settle();
      component().model.update((m) => ({ ...m, vehicleId: "v1", sanityTest: true }));
      await settle();
      expect(savedDraft()).not.toBeNull();

      await component().submit();
      await settle();

      expect(TestBed.inject(GraphQLClient).request).toHaveBeenCalledTimes(1);
      expect(savedDraft()).toBeNull();
    });
  });

  describe("when the submit request fails", () => {
    /** A valid, logged-in draft: line 4 and its vehicle v1 (out of service, so sanity-checked). */
    async function readyToSubmit(): Promise<ComponentUnderTest & { submit(): Promise<void> }> {
      (TestBed.inject(AuthService).isLoggedIn as unknown as WritableSignal<boolean>).set(true);
      storeLines.set([SEEDED_LINE]);
      sheet.openFor("4");
      await settle();
      const component = fixture.componentInstance as unknown as ComponentUnderTest & {
        submit(): Promise<void>;
      };
      component.model.update((m) => ({ ...m, vehicleId: "v1", sanityTest: true }));
      await settle();
      return component;
    }

    it("toasts and rethrows when the failure is not a GraphQL error (offline, 5xx)", async () => {
      // Only a GraphQLRequestError is toasted (by GraphQLClient). A dropped tunnel or a 502 reaches
      // the catch as an HttpErrorResponse and used to leave a re-enabled button and no message.
      const component = await readyToSubmit();
      const outage = new HttpErrorResponse({ status: 502, statusText: "Bad Gateway" });
      vi.mocked(TestBed.inject(GraphQLClient).request).mockRejectedValueOnce(outage);

      await expect(component.submit()).rejects.toBe(outage);

      expect(TestBed.inject(ToastService).error).toHaveBeenCalledExactlyOnceWith(
        "Couldn't submit",
        "Check your connection and try again.",
      );
    });

    it("adds no toast of its own for a GraphQL error, which GraphQLClient already showed", async () => {
      const component = await readyToSubmit();
      vi.mocked(TestBed.inject(GraphQLClient).request).mockRejectedValueOnce(
        new GraphQLRequestError([{ message: "Vehicle not found" }]),
      );

      await component.submit();

      expect(TestBed.inject(GraphQLClient).request).toHaveBeenCalledTimes(1);
      expect(TestBed.inject(ToastService).error).not.toHaveBeenCalled();
    });
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

  it("shows the selected vehicle's status inside the field and the sanity check directly below", async () => {
    storeLines.set([SEEDED_LINE]);
    sheet.openFor("4");
    await settle();

    const component = fixture.componentInstance as unknown as ComponentUnderTest;
    component.model.update((m) => ({ ...m, vehicleId: "v1" }));
    await settle();

    const root = fixture.nativeElement as HTMLElement;

    // The status badge now lives inside the vehicle combobox field (trailing), not on its own
    // row below it — exactly one badge is rendered and it is inside the combobox host.
    expect(root.querySelectorAll("vehicle-status-badge").length).toBe(1);
    const vehicleCombobox = root.querySelectorAll("hlm-combobox")[1];
    const badge = vehicleCombobox?.querySelector("vehicle-status-badge");
    if (!badge) throw new Error("vehicle status badge not rendered inside the field");
    expect(badge.textContent).toContain("Out of Service");

    // The abnormal-status sanity check follows the vehicle field immediately, before the Date
    // field — not down at the bottom of the form. The field wrapper is a plain div (labels are
    // layout-only now), so anchor on the combobox's own wrapper.
    const vehicleField = vehicleCombobox?.parentElement;
    if (!vehicleField) throw new Error("vehicle field not rendered");
    const sanity = vehicleField.nextElementSibling;
    expect(sanity?.textContent).toContain("may not normally be spottable");
    expect(sanity?.querySelector("hlm-checkbox")).not.toBeNull();

    // Clearing the vehicle removes both the trailing badge and the sanity block again.
    component.model.update((m) => ({ ...m, vehicleId: "" }));
    await settle();
    expect(root.querySelectorAll("vehicle-status-badge").length).toBe(0);
    expect(root.textContent).not.toContain("may not normally be spottable");
  });

  describe("LOCATION spotting", () => {
    async function openLocationReport(): Promise<ComponentUnderTest> {
      storeLines.set([SEEDED_LINE]);
      sheet.openFor("4");
      await settle();

      const component = fixture.componentInstance as unknown as ComponentUnderTest;
      // v1 is OUT_OF_SERVICE in the seeded fleet, so the sanity-test gate must be ticked too.
      component.model.update((m) => ({
        ...m,
        vehicleId: "v1",
        sanityTest: true,
        type: "LOCATION",
      }));
      component.capturedLocation.set(CAPTURED_COORDS);
      await settle();
      return component;
    }

    it("submits only accuracy, latitude and longitude of the captured position", async () => {
      await openLocationReport();
      (
        TestBed.inject(AuthService) as unknown as { isLoggedIn: WritableSignal<boolean> }
      ).isLoggedIn.set(true);
      const request = (TestBed.inject(GraphQLClient) as unknown as { request: Mock }).request;
      request.mockResolvedValue({ addEvent: { id: "e1" } });

      await fixture.componentInstance.submit();

      expect(request).toHaveBeenCalledTimes(1);
      const { data } = request.mock.calls[0][1] as { data: { location: object } };
      // Omitted keys are the backend's UNSET; altitude, altitudeAccuracy, speed and heading must
      // not be present at all (not even as null).
      expect(data.location).toStrictEqual({
        accuracy: 12,
        latitude: 3.1579,
        longitude: 101.7116,
      });
    });

    it("says the spotted position is public unless Submit anonymously is ticked", async () => {
      await openLocationReport();

      const text = ((fixture.nativeElement as HTMLElement).textContent ?? "").replace(/\s+/g, " ");
      expect(text).toContain("Location captured (±12m).");
      expect(text).toContain("The spotted position is shown publicly with your report.");
      expect(text).toContain('If you tick "Submit anonymously", only you and admins can see it.');
      expect(text).not.toContain("We won't know your exact location");
    });
  });

  it("shows no toast when the location arrives; the helper text already says who can see it", async () => {
    // The old toast ("we will not know your location until you submit") implied the position stays
    // private, which F043 objected to, and it fired before the rider saw the helper text.
    const toast = TestBed.inject(ToastService);
    const component = fixture.componentInstance as unknown as ComponentUnderTest & {
      onTypeChanged(): void;
    };
    component.model.update((m) => ({ ...m, type: "LOCATION" }));
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (ok: (p: GeolocationPosition) => void) =>
          ok({ coords: CAPTURED_COORDS } as GeolocationPosition),
      },
    });
    try {
      component.onTypeChanged();
      await settle();
    } finally {
      delete (navigator as { geolocation?: unknown }).geolocation;
    }

    expect(component.capturedLocation()).toBe(CAPTURED_COORDS);
    expect(toast.info).not.toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain("Location captured");
  });

  it("announces the capture through the helper's live region, which survives the text swap", async () => {
    // With no toast, the screen-reader cue is the helper text itself: it must be one persistent
    // role="status" element, or the swap from "Waiting" to "captured" is inserted silently.
    const component = fixture.componentInstance as unknown as ComponentUnderTest;
    component.model.update((m) => ({ ...m, type: "LOCATION" }));
    await settle();
    const root = fixture.nativeElement as HTMLElement;
    const region = root.querySelector('p[role="status"]');
    expect(region?.textContent).toContain("Waiting for location access");

    component.capturedLocation.set(CAPTURED_COORDS);
    await settle();

    expect(root.querySelector('p[role="status"]')).toBe(region);
    expect(region?.textContent).toContain("Location captured (±12m).");
  });

  describe("when created lazily by the sheet", () => {
    async function createLate(): Promise<ComponentFixture<ReportFormComponent>> {
      const late = TestBed.createComponent(ReportFormComponent);
      late.detectChanges();
      httpMock
        .expectOne((r) => r.method === "POST" && r.body.query.includes("LinesAndVehicles"))
        .flush({ data: { lines: [SEEDED_FLEET_LINE] } });
      await late.whenStable();
      return late;
    }

    it("moves focus to its first control when created with the sheet already open", async () => {
      // Cold first open: the sheet's focus trap captured focus before the deferred form existed
      // (onto the footer), and nothing else would ever move it into the form.
      const footer = document.body.appendChild(document.createElement("button"));
      footer.focus();
      sheet.open();

      const late = await createLate();

      const first = (late.nativeElement as HTMLElement).querySelector(
        "input,select,textarea,button",
      );
      expect(first).not.toBeNull();
      expect(document.activeElement).toBe(first);
      footer.remove();
    });

    it("leaves focus alone when created while the sheet is closed", async () => {
      const outside = document.body.appendChild(document.createElement("button"));
      outside.focus();

      await createLate();

      expect(document.activeElement).toBe(outside);
      outside.remove();
    });
  });

  it("keeps field label text inert while preserving accessible names", async () => {
    storeLines.set([SEEDED_LINE]);
    sheet.openFor("4");
    await settle();

    const root = fixture.nativeElement as HTMLElement;

    // Label text is layout-only: the control is not nested in a <label>, so clicking "Line"
    // can never focus the field or expand the combobox.
    const lineInput = root.querySelector<HTMLInputElement>("hlm-combobox input");
    if (!lineInput) throw new Error("line combobox input not rendered");
    expect(lineInput.closest("label")).toBeNull();
    expect(lineInput.getAttribute("aria-label")).toBe("Line");

    // The names survive as explicit aria-labels on the controls.
    expect(root.querySelector('[aria-label="Date"]')).not.toBeNull();
    expect(root.querySelector('select[aria-label="Status"]')).not.toBeNull();

    // The visible text is no longer part of any <label> ...
    const labelTexts = Array.from(root.querySelectorAll("label")).map((l) => l.textContent?.trim());
    expect(labelTexts.some((t) => t?.includes("Line"))).toBe(false);

    // ... while the real checkbox labels stay labels (their text still toggles the box).
    expect(labelTexts.some((t) => t?.includes("Submit anonymously"))).toBe(true);
  });
});
