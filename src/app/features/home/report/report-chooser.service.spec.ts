import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { isLineIntent, ReportChooserService } from "./report-chooser.service";

describe("ReportChooserService", () => {
  let chooser: ReportChooserService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    chooser = TestBed.inject(ReportChooserService);
  });

  it("starts closed on the tiles step", () => {
    expect(chooser.isOpen()).toBe(false);
    expect(chooser.intent()).toBeNull();
  });

  it("opens on the tiles step", () => {
    chooser.open();

    expect(chooser.isOpen()).toBe(true);
    expect(chooser.intent()).toBeNull();
  });

  it("advances to the line picker for a line intent and back again", () => {
    chooser.open();
    chooser.choose("stopped");
    expect(chooser.intent()).toBe("stopped");
    expect(chooser.isOpen()).toBe(true);

    chooser.backToTiles();
    expect(chooser.intent()).toBeNull();
    expect(chooser.isOpen()).toBe(true);
  });

  it("clears the half-finished step on close", () => {
    // The one-shot rule: a chooser reopened by a stale trigger must land on the TILES, never on a
    // reader's abandoned "which line?" question.
    chooser.choose("delay");
    chooser.isOpen.set(true);

    chooser.setOpen(false);

    expect(chooser.isOpen()).toBe(false);
    expect(chooser.intent()).toBeNull();
  });

  it("keeps the step when re-opened through open()", () => {
    chooser.choose("spot");

    chooser.open();

    expect(chooser.isOpen()).toBe(true);
    expect(chooser.intent()).toBeNull();
  });
});

describe("isLineIntent", () => {
  it("is true only for the three intents that need a line", () => {
    expect(isLineIntent("delay")).toBe(true);
    expect(isLineIntent("stopped")).toBe(true);
    expect(isLineIntent("spot")).toBe(true);
    expect(isLineIntent("link")).toBe(false);
    expect(isLineIntent("incident")).toBe(false);
  });
});
