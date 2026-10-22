import { CUSTOM_ELEMENTS_SCHEMA, provideZonelessChangeDetection, signal } from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import {
  ComponentFixture,
  DeferBlockBehavior,
  DeferBlockState,
  TestBed,
} from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient } from "../../../core/graphql/graphql-client";
import { ImageCompressionService } from "../../../core/upload/image-compression.service";
import { ImageUploadService } from "../../../core/upload/image-upload.service";
import { AppFooterComponent } from "../../../shell/app-footer/app-footer.component";
import { AppNavComponent } from "../../../shell/app-nav/app-nav.component";
import { AdSlotComponent } from "../../../ui/ad-slot/ad-slot.component";
import { ToastService } from "../../../ui/toast/toast.service";
import { ReportSheetService } from "../data/report-sheet.service";
import { SpottingLinesStore } from "../data/spotting-lines.store";
import { PhotoPickerComponent } from "../report-form/photo-picker/photo-picker.component";
import { REPORT_FORM_DRAFT_KEY } from "../report-form/report-form-draft.util";
import { ReportFormComponent } from "../report-form/report-form.component";
import { SpottingShellPage } from "./spotting-shell.page";

interface FormUnderTest {
  model(): { lineId: string };
}

const isFleetRead = (request: { method: string; body?: { query?: string } }): boolean =>
  request.method === "POST" && (request.body?.query ?? "").includes("LinesAndVehicles");

/** The shell chrome and ad slots pull in live services; the sheet hosting is what's under test. */
async function configureShell(deferBlockBehavior?: DeferBlockBehavior): Promise<void> {
  await TestBed.configureTestingModule({
    imports: [SpottingShellPage],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: SpottingLinesStore, useValue: { lines: signal([]) } },
      { provide: ImageUploadService, useValue: { addToQueue: vi.fn() } },
      { provide: ImageCompressionService, useValue: { resizeToSize: vi.fn() } },
      {
        provide: AuthService,
        useValue: {
          isLoggedIn: signal(false),
          user: signal(null),
          login: vi.fn(),
        },
      },
      { provide: GraphQLClient, useValue: { request: vi.fn() } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
    ],
    deferBlockBehavior,
  })
    .overrideComponent(SpottingShellPage, {
      remove: { imports: [AppNavComponent, AppFooterComponent, AdSlotComponent] },
      add: { schemas: [CUSTOM_ELEMENTS_SCHEMA] },
    })
    .compileComponents();
}

function footerButton(fixture: ComponentFixture<SpottingShellPage>, label: string) {
  const footer = (fixture.nativeElement as HTMLElement).querySelector("[hlmSheetFooter]");
  const match = [...(footer?.querySelectorAll("button") ?? [])].find(
    (button) => (button.textContent ?? "").trim() === label,
  );
  if (!match) throw new Error(`footer button "${label}" not rendered`);
  return match;
}

describe("SpottingShellPage report sheet", () => {
  let fixture: ComponentFixture<SpottingShellPage>;
  let httpMock: HttpTestingController;
  let sheet: ReportSheetService;

  function mountedForm() {
    return fixture.debugElement.query(By.directive(ReportFormComponent));
  }

  /**
   * Opening the sheet resolves its `@defer` block, and the form it renders then starts a fleet-wide
   * read that keeps the app unstable until answered — so `whenStable()` cannot come first. Poll for
   * the read (it only exists once the form does), answer it, and let the answer land. Change
   * detection after the open is left to the scheduler on purpose: a manual `detectChanges()` here
   * would hide a footer that never refreshes once the form appears.
   */
  async function settleOpenedSheet(): Promise<void> {
    const reads = await vi.waitFor(
      () => {
        const found = httpMock.match(isFleetRead);
        if (found.length === 0) throw new Error("the deferred form has not started its read yet");
        return found;
      },
      { timeout: 3000 },
    );
    for (const read of reads) read.flush({ data: { lines: [] } });
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await configureShell();
    httpMock = TestBed.inject(HttpTestingController);
    sheet = TestBed.inject(ReportSheetService);
    fixture = TestBed.createComponent(SpottingShellPage);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    // A picked photo makes the form save a draft, which a later test's open would restore. Removed
    // before verify(), which can throw, and only this key: the worker shares sessionStorage.
    sessionStorage.removeItem(REPORT_FORM_DRAFT_KEY);
    httpMock.verify();
  });

  it("creates no report form, and so no fleet-wide read, while the sheet stays closed", () => {
    // 🔴 Every /spotting page mounts this shell. A form mounted with it ran its LinesAndVehicles
    // read during SSR (~70 KB of TransferState on /spotting/3); `afterEach`'s `verify()` also pins
    // that no read is left unanswered.
    expect(httpMock.match(isFleetRead)).toHaveLength(0);
    expect(mountedForm()).toBeNull();
  });

  it("creates the form when the sheet opens, and the footer buttons then drive it", async () => {
    sheet.open();
    await settleOpenedSheet();

    const form = mountedForm();
    expect(form).not.toBeNull();
    const submit = vi.spyOn(form.componentInstance as ReportFormComponent, "submit");
    submit.mockResolvedValue(undefined);
    const clear = vi.spyOn(form.componentInstance as ReportFormComponent, "clear");

    // The footer refreshed by itself once the block rendered the form.
    expect(footerButton(fixture, "Submit").disabled).toBe(false);
    footerButton(fixture, "Submit").click();
    footerButton(fixture, "Clear form").click();

    expect(submit).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it("holds Submit back while a picked photo compresses, and frees its preview on close", async () => {
    // Spied and restored, never deleted: later spec files in this worker share this `URL`.
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    onTestFinished(() => {
      createObjectURL.mockRestore();
      revokeObjectURL.mockRestore();
    });
    let finish!: (file: File) => void;
    vi.mocked(TestBed.inject(ImageCompressionService).resizeToSize).mockReturnValue(
      new Promise<File>((resolve) => (finish = resolve)),
    );
    sheet.open();
    await settleOpenedSheet();
    const picker = fixture.debugElement.query(By.directive(PhotoPickerComponent));
    const big = new File([new Uint8Array(9_000_001)], "big.jpg", { type: "image/jpeg" });

    const picking = (
      picker.componentInstance as { _onFilesPicked(event: Event): Promise<void> }
    )._onFilesPicked({ target: { files: [big], value: "picked" } } as unknown as Event);
    await fixture.whenStable();

    // A photo queued before its compression settles is never uploaded (PhotoPickerComponent).
    expect(footerButton(fixture, "Processing photos…").disabled).toBe(true);

    finish(new File([new Uint8Array(8)], "big.jpg", { type: "image/jpeg" }));
    await picking;
    await fixture.whenStable();

    expect(footerButton(fixture, "Submit").disabled).toBe(false);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    // Closing the sheet resets the form, which empties the picker: its preview URL is freed.
    sheet.setOpen(false);
    await fixture.whenStable();

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  });

  it("hands the form a line chosen before the form existed, once, and does not keep it", async () => {
    // A trigger that opens the sheet for a line sets the seed before the form is created; it must
    // survive until the form's open-edge effect consumes it.
    sheet.openFor("4");
    await settleOpenedSheet();

    const form = mountedForm();
    expect((form.componentInstance as unknown as FormUnderTest).model().lineId).toBe("4");
    expect(sheet.lineId()).toBeNull();
  });

  it("closes the sheet when the form reports a submit", async () => {
    sheet.open();
    await settleOpenedSheet();

    mountedForm().componentInstance.submitted.emit("4");

    expect(sheet.isOpen()).toBe(false);
  });
});

/**
 * With the defer block held unresolved by the test (Manual behaviour), the state the footer shows
 * while the form's chunk is still loading is observable on every run — in Playthrough mode it
 * depends on whether an earlier spec in the file already loaded the chunk.
 */
describe("SpottingShellPage before its deferred form resolves", () => {
  let fixture: ComponentFixture<SpottingShellPage>;
  let httpMock: HttpTestingController;
  let sheet: ReportSheetService;

  beforeEach(async () => {
    await configureShell(DeferBlockBehavior.Manual);
    httpMock = TestBed.inject(HttpTestingController);
    sheet = TestBed.inject(ReportSheetService);
    fixture = TestBed.createComponent(SpottingShellPage);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it("holds Submit back until the form renders, without throwing on the missing form", async () => {
    sheet.open();
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();

    // The panel is up but the block has not resolved: there is no form to submit yet, so Submit is
    // disabled rather than dead, and the footer's reads of the missing form must not throw.
    expect(footerButton(fixture, "Submit").disabled).toBe(true);
    expect(fixture.debugElement.query(By.directive(ReportFormComponent))).toBeNull();

    const [block] = await fixture.getDeferBlocks();
    await block.render(DeferBlockState.Complete);
    for (const read of httpMock.match(isFleetRead)) {
      read.flush({ data: { lines: [] } });
    }
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.directive(ReportFormComponent))).not.toBeNull();
    expect(footerButton(fixture, "Submit").disabled).toBe(false);
  });

  it("starts the form blank when its sheet was closed before the form existed", async () => {
    // The form is created lazily, so a line seed set for an open that never reached it must not
    // leak into the next, unrelated open.
    sheet.openFor("4");
    fixture.detectChanges();
    sheet.setOpen(false);

    const [block] = await fixture.getDeferBlocks();
    await block.render(DeferBlockState.Complete);
    for (const read of httpMock.match(isFleetRead)) {
      read.flush({ data: { lines: [] } });
    }
    await fixture.whenStable();
    sheet.open();
    await fixture.whenStable();
    fixture.detectChanges();

    const form = fixture.debugElement.query(By.directive(ReportFormComponent));
    expect((form.componentInstance as unknown as FormUnderTest).model().lineId).toBe("");
  });
});
