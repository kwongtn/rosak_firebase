import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { PreferencesService } from "../../../core/preferences/preferences.service";
import { LineStatusSheetService } from "./line-status-sheet.service";

describe("LineStatusSheetService", () => {
  let service: LineStatusSheetService;
  let preferences: PreferencesService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [LineStatusSheetService] });
    service = TestBed.inject(LineStatusSheetService);
    preferences = TestBed.inject(PreferencesService);
  });

  it("opens the sheet on the given line, with no preset by default", () => {
    service.openFor("line-7");

    expect(service.isOpen()).toBe(true);
    expect(service.lineId()).toBe("line-7");
    expect(service.presetStatus()).toBeNull();
  });

  it("remembers the line as the last reported one when the sheet opens for it", () => {
    expect(preferences.lastReportedLineId()).toBeNull();

    service.openFor("line-7");

    expect(preferences.lastReportedLineId()).toBe("line-7");
  });

  it("remembers the most recent line, not the first one", () => {
    service.openFor("line-1");
    service.setOpen(false);
    service.openFor("line-2", { presetStatus: "DISRUPTED" });

    expect(preferences.lastReportedLineId()).toBe("line-2");
    expect(service.presetStatus()).toBe("DISRUPTED");
  });
});
