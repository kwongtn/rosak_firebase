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
});
