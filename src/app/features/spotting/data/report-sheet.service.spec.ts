import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { ReportSheetService } from "./report-sheet.service";

describe("ReportSheetService", () => {
  let service: ReportSheetService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    service = TestBed.inject(ReportSheetService);
  });

  it("openFor seeds the line and opens the sheet", () => {
    service.openFor("4");

    expect(service.lineId()).toBe("4");
    expect(service.isOpen()).toBe(true);
  });

  it("open opens the sheet without a line seed", () => {
    service.open();

    expect(service.lineId()).toBeNull();
    expect(service.isOpen()).toBe(true);
  });

  it("setOpen closes the sheet", () => {
    service.openFor("4");
    service.setOpen(false);

    expect(service.isOpen()).toBe(false);
  });

  it("setOpen(false) drops a seed no form consumed, so it cannot seed the next open", () => {
    // The form is created lazily on the first open, so a sheet closed before then leaves its seed
    // unconsumed — and the form created afterwards would pre-select an unrelated line.
    service.openFor("4");
    service.setOpen(false);

    expect(service.lineId()).toBeNull();
    service.open();
    expect(service.lineId()).toBeNull();
  });
});
