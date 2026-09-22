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
import { ReportFormComponent } from "./report-form.component";
import type { ReportFormModel } from "./report-form.schema";

interface ComponentUnderTest {
  model: WritableSignal<ReportFormModel>;
}

describe("ReportFormComponent", () => {
  let fixture: ComponentFixture<ReportFormComponent>;
  let httpMock: HttpTestingController;
  let sheet: ReportSheetService;

  function model(): ReportFormModel {
    return (fixture.componentInstance as unknown as ComponentUnderTest).model();
  }

  /** Lets the pending sheet-edge effect run and the re-rendered DOM settle. */
  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReportFormComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClientTesting(),
        { provide: SpottingLinesStore, useValue: { lines: signal([]) } },
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
});
