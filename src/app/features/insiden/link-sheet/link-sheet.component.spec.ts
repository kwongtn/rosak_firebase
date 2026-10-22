import { provideZonelessChangeDetection, type WritableSignal } from "@angular/core";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import {
  ComponentFixture,
  DeferBlockBehavior,
  DeferBlockState,
  TestBed,
} from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../../core/auth/auth.service";
import { GraphQLClient } from "../../../core/graphql/graphql-client";
import { ToastService } from "../../../ui/toast/toast.service";
import { LinkSheetService } from "../data/link-sheet.service";
import { LinkFormComponent } from "../link-form/link-form.component";
import { LinkSheetComponent } from "./link-sheet.component";

interface FormUnderTest {
  model: WritableSignal<{ url: string; title: string; occurredAt: string }>;
  selectedLineIds: WritableSignal<string[]>;
}

const REFERENCE_DATA = {
  lines: [
    { id: "L1", code: "KJL", displayName: "Kelana Jaya Line", vehicleTypes: [] },
    { id: "L2", code: "AGL", displayName: "Ampang Line", vehicleTypes: [] },
  ],
  stations: [],
  calendarIncidentCategories: [{ id: "C1", name: "Just Reporting" }],
};

const EDIT_TARGET = {
  id: "7",
  url: "https://example.com/seven",
  title: "Seven",
  lines: [{ id: "L1" }],
};

const isReferenceRead = (request: { method: string; body?: { query?: string } }): boolean =>
  request.method === "POST" && (request.body?.query ?? "").includes("InsidenReferenceData");

function providers() {
  return [
    provideZonelessChangeDetection(),
    provideHttpClientTesting(),
    {
      provide: AuthService,
      useValue: { isLoggedIn: () => true, login: vi.fn(), idToken: async () => "token" },
    },
    { provide: GraphQLClient, useValue: { request: vi.fn() } },
    { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
  ];
}

describe("LinkSheetComponent", () => {
  let fixture: ComponentFixture<LinkSheetComponent>;
  let httpMock: HttpTestingController;
  let sheet: LinkSheetService;

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function footerButton(label: string): HTMLButtonElement {
    const footer = root().querySelector("[hlmSheetFooter]");
    const match = [...(footer?.querySelectorAll("button") ?? [])].find(
      (button) => (button.textContent ?? "").trim() === label,
    );
    if (!match) throw new Error(`footer button "${label}" not rendered`);
    return match;
  }

  function mountedForm() {
    return fixture.debugElement.query(By.directive(LinkFormComponent));
  }

  /**
   * Opening the sheet resolves its `@defer` block, and the form it renders then starts a reference
   * read that keeps the app unstable until answered — so `whenStable()` cannot come first. Poll for
   * the read (it only exists once the form does), answer it, and let the answer land. Change
   * detection after the open is left to the scheduler on purpose: a manual `detectChanges()` here
   * would hide a footer that never refreshes once the form appears.
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
    for (const read of reads) read.flush({ data: REFERENCE_DATA });
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LinkSheetComponent],
      providers: providers(),
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    sheet = TestBed.inject(LinkSheetService);
    fixture = TestBed.createComponent(LinkSheetComponent);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it("creates no link form, and so no reference read, while the sheet stays closed", () => {
    // 🔴 Home, /insiden and every line's Situasi tab mount this sheet. A form mounted with it ran
    // the fleet-wide InsidenReferenceData read during SSR and serialised it into TransferState on
    // each of them; `afterEach`'s `verify()` also pins that no read is left unanswered.
    expect(httpMock.match(isReferenceRead)).toHaveLength(0);
    expect(mountedForm()).toBeNull();
  });

  it("creates the form when the sheet opens, and the footer buttons then drive it", async () => {
    sheet.open();
    await settleOpenedSheet();

    const form = mountedForm();
    expect(form).not.toBeNull();
    const submit = vi.spyOn(form.componentInstance as LinkFormComponent, "submit");
    submit.mockResolvedValue(undefined);
    const clear = vi.spyOn(form.componentInstance as LinkFormComponent, "clear");

    // The footer refreshed by itself once the block rendered the form.
    expect(footerButton("Submit").disabled).toBe(false);
    footerButton("Submit").click();
    footerButton("Clear form").click();

    expect(submit).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it("holds Submit back until the reference read lands, so no default line or category is dropped", async () => {
    // The form is created on open and starts its read then; a Submit before the answer would file
    // the link with no line and no category, silently.
    sheet.open();
    const reads = await vi.waitFor(
      () => {
        const found = httpMock.match(isReferenceRead);
        if (found.length === 0) throw new Error("the deferred form has not started its read yet");
        return found;
      },
      { timeout: 3000 },
    );
    fixture.detectChanges();

    expect(mountedForm()).not.toBeNull();
    expect(footerButton("Submit").disabled).toBe(true);

    for (const read of reads) read.flush({ data: REFERENCE_DATA });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(footerButton("Submit").disabled).toBe(false);
  });

  it("hands the form a URL prefilled before the form existed, once", async () => {
    // The home feed's "Advanced Input" opens the sheet with the typed URL; the form is not created
    // until the open, so the service must hold the value until the form's first effect takes it.
    sheet.open(undefined, { url: "https://example.com/story" });
    await settleOpenedSheet();

    const form = mountedForm().componentInstance as unknown as FormUnderTest;
    expect(form.model().url).toBe("https://example.com/story");
    expect(sheet.prefillUrl()).toBeNull();
  });

  it("hydrates an edit opened before the form existed", async () => {
    sheet.openEdit(EDIT_TARGET);
    await settleOpenedSheet();

    const form = mountedForm().componentInstance as unknown as FormUnderTest;
    expect(form.model().url).toBe("https://example.com/seven");
    expect(form.selectedLineIds()).toEqual(["L1"]);
    expect(root().querySelector("h2")?.textContent?.trim()).toBe("Edit link");
    expect(footerButton("Save").disabled).toBe(false);
  });

  it("applies the host's default lines once the lazily created form's reference read lands", async () => {
    // The Situasi tab pre-targets its line; the form only starts loading the line list on open.
    fixture.componentRef.setInput("defaultLineIds", ["L2"]);
    sheet.open();
    await settleOpenedSheet();

    const form = mountedForm().componentInstance as unknown as FormUnderTest;
    expect(form.selectedLineIds()).toEqual(["L2"]);
  });

  it("words the sheet as a submission in create mode", async () => {
    sheet.open();
    await settleOpenedSheet();

    expect(root().querySelector("h2")?.textContent?.trim()).toBe("Submit a link");
    expect(footerButton("Submit").disabled).toBe(false);
  });

  it("disables the footer while a submit is in flight and labels the button Saving", async () => {
    sheet.open();
    await settleOpenedSheet();
    const form = mountedForm().componentInstance as LinkFormComponent;

    form.isSubmitting.set(true);
    fixture.detectChanges();

    expect(footerButton("Saving…").disabled).toBe(true);
    expect(footerButton("Clear form").disabled).toBe(true);

    form.isSubmitting.set(false);
    fixture.detectChanges();

    expect(footerButton("Submit").disabled).toBe(false);
    expect(footerButton("Clear form").disabled).toBe(false);
  });
});

/**
 * With the defer block held unresolved by the test (Manual behaviour), the state the footer shows
 * while the form's chunk is still loading is observable on every run — in Playthrough mode it
 * depends on whether an earlier spec in the file already loaded the chunk.
 */
describe("LinkSheetComponent before its deferred form resolves", () => {
  let fixture: ComponentFixture<LinkSheetComponent>;
  let httpMock: HttpTestingController;
  let sheet: LinkSheetService;

  function footerButton(label: string): HTMLButtonElement {
    const footer = (fixture.nativeElement as HTMLElement).querySelector("[hlmSheetFooter]");
    const match = [...(footer?.querySelectorAll("button") ?? [])].find(
      (button) => (button.textContent ?? "").trim() === label,
    );
    if (!match) throw new Error(`footer button "${label}" not rendered`);
    return match;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LinkSheetComponent],
      providers: providers(),
      deferBlockBehavior: DeferBlockBehavior.Manual,
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    sheet = TestBed.inject(LinkSheetService);
    fixture = TestBed.createComponent(LinkSheetComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it("words the sheet for an edit and holds Submit back until the form renders", async () => {
    sheet.openEdit(EDIT_TARGET);
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();

    // Both labels read the service, not the form, so the first-ever open does not flash the create
    // wording while the form's chunk loads — and the footer's reads of the missing form must not
    // throw.
    expect((fixture.nativeElement as HTMLElement).querySelector("h2")?.textContent?.trim()).toBe(
      "Edit link",
    );
    expect(footerButton("Save").disabled).toBe(true);
    expect(fixture.debugElement.query(By.directive(LinkFormComponent))).toBeNull();

    const [block] = await fixture.getDeferBlocks();
    await block.render(DeferBlockState.Complete);
    for (const read of httpMock.match(isReferenceRead)) {
      read.flush({ data: REFERENCE_DATA });
    }
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.directive(LinkFormComponent))).not.toBeNull();
    expect(footerButton("Save").disabled).toBe(false);
  });

  it("does not hydrate a form that finishes loading after the edit was abandoned", async () => {
    // Close before the deferred form is created. The service drops the edit target on close, so the
    // form that appears afterwards starts blank instead of carrying the abandoned link into the next
    // create-mode open (it would otherwise hydrate it, and nothing would ever clear it).
    sheet.openEdit(EDIT_TARGET);
    fixture.detectChanges();
    sheet.close();

    const [block] = await fixture.getDeferBlocks();
    await block.render(DeferBlockState.Complete);
    for (const read of httpMock.match(isReferenceRead)) {
      read.flush({ data: REFERENCE_DATA });
    }
    await fixture.whenStable();

    const form = fixture.debugElement.query(By.directive(LinkFormComponent))
      .componentInstance as unknown as FormUnderTest;
    expect(form.model().url).toBe("");
    expect(form.selectedLineIds()).toEqual([]);
  });
});
