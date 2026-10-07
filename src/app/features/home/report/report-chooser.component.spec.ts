import { signal, provideZonelessChangeDetection, type WritableSignal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { Router, provideRouter } from "@angular/router";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import { PreferencesService } from "../../../core/preferences/preferences.service";
import { HlmSheet } from "../../../ui/sheet/sheet";
import { IncidentSheetService } from "../../insiden/data/incident-sheet.service";
import { LinkSheetService } from "../../insiden/data/link-sheet.service";
import { ReportSheetService } from "../../spotting/data/report-sheet.service";
import { HomeStore } from "../data/home.store";
import type { LinePulse } from "../data/home-board.queries";
import { LineStatusSheetService } from "../data/line-status-sheet.service";
import { ReportChooserComponent } from "./report-chooser.component";
import { ReportChooserService } from "./report-chooser.service";

function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

function makeLine(id: string, overrides: Partial<LinePulse> = {}): LinePulse {
  return {
    id,
    code: id.toUpperCase(),
    displayName: `Line ${id}`,
    displayColor: "#e11d48",
    status: "ACTIVE",
    inServiceVehicleCount: 1,
    totalVehicleCount: 2,
    passengerStatus: "NORMAL",
    passengerStatusMessage: null,
    statusReportCount: 2,
    vehicleStatusCounts: [],
    passengerStatusCount: 0,
    statusWindowMinutes: 60,
    pulseLinks: [],
    ...overrides,
  };
}

/** The five tile testids, in the order the plan fixes them. */
const TILE_TESTIDS = [
  "chooser-tile-delay",
  "chooser-tile-stopped",
  "chooser-tile-spot",
  "chooser-tile-link",
  "chooser-tile-incident",
];

describe("ReportChooserComponent", () => {
  let fixture: ComponentFixture<ReportChooserComponent>;
  let chooser: ReportChooserService;
  let lineStatusSheet: { openFor: ReturnType<typeof vi.fn> };
  let reportSheet: { openFor: ReturnType<typeof vi.fn> };
  let linkSheet: { open: ReturnType<typeof vi.fn> };
  let incidentSheet: { open: ReturnType<typeof vi.fn> };
  let preferences: {
    pinnedLineIds: WritableSignal<string[]>;
    recentLineIds: WritableSignal<string[]>;
    pushRecentLine: ReturnType<typeof vi.fn>;
  };
  let lines: WritableSignal<LinePulse[]>;
  let navigate: ReturnType<typeof vi.fn>;

  async function boot(viewportWide = true): Promise<HTMLElement> {
    fixture?.destroy();
    lines = signal<LinePulse[]>([
      makeLine("ok1"),
      makeLine("dead", { status: "TOTAL_DISRUPTION", statusReportCount: 9 }),
      makeLine("ok2"),
    ]);
    lineStatusSheet = { openFor: vi.fn() };
    reportSheet = { openFor: vi.fn() };
    linkSheet = { open: vi.fn() };
    incidentSheet = { open: vi.fn() };
    preferences = {
      pinnedLineIds: signal<string[]>([]),
      recentLineIds: signal<string[]>([]),
      pushRecentLine: vi.fn(),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ReportChooserComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        // The route provides this one in the app; the chooser only ever reads `lines()` off it, so
        // the mock is the store's public surface and nothing else.
        { provide: HomeStore, useValue: { lines } },
        { provide: LineStatusSheetService, useValue: lineStatusSheet },
        { provide: ReportSheetService, useValue: reportSheet },
        { provide: LinkSheetService, useValue: linkSheet },
        { provide: IncidentSheetService, useValue: incidentSheet },
        { provide: PreferencesService, useValue: preferences },
      ],
    });
    await TestBed.compileComponents();
    // Injected only AFTER configureTestingModule: an `inject` before it would instantiate the module
    // and the next configure would throw.
    chooser = TestBed.inject(ReportChooserService);
    // Spied THROUGH the real router, not replaced: `RouterLink` needs the genuine Router and only
    // `navigate` has to be observable.
    navigate = vi.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true);

    stubMatchMedia(viewportWide);
    fixture = TestBed.createComponent(ReportChooserComponent);
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
    chooser.open();
    fixture.detectChanges();
    // 🔴 HlmSheet renders NO panel DOM until it has been open once, and the flag is set inside its
    // own effect — so opening needs a render pass to set it and ANOTHER to materialise the body. One
    // detectChanges() here silently produces an empty sheet and every assertion below fails for the
    // wrong reason.
    TestBed.tick();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function tile(testId: string): HTMLButtonElement | null {
    return root().querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
  }

  function tileLabel(testId: string): string {
    return (
      tile(testId)?.querySelector("span > span")?.textContent?.replace(/\s+/g, " ").trim() ?? ""
    );
  }

  /**
   * The line ids currently rendered by the picker, in DOM order.
   *
   * Scoped to the LIST container on purpose: a `[data-testid^="chooser-line-"]` prefix match also
   * catches `chooser-line-picker`, `chooser-line-filter` and `chooser-line-hint`, and an ordering
   * assertion that has to filter those out by hand is one typo away from passing on nothing.
   */
  function listedLineIds(): string[] {
    return Array.from(root().querySelectorAll('[data-testid="chooser-line-list"] > button')).map(
      (element) => (element.getAttribute("data-testid") ?? "").replace("chooser-line-", ""),
    );
  }

  async function pickTile(testId: string): Promise<void> {
    tile(testId)?.click();
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("the tiles", () => {
    it("offers exactly the plan's five intents, in order", async () => {
      const view = await boot();

      const rendered = Array.from(view.querySelectorAll('[data-testid^="chooser-tile-"]')).map(
        (element) => element.getAttribute("data-testid"),
      );
      expect(rendered).toEqual(TILE_TESTIDS);
      expect(rendered).toHaveLength(5);

      // The labels are the rider's words, not the feature names behind them.
      expect(TILE_TESTIDS.map(tileLabel)).toEqual([
        "Delay / crowding",
        "Stopped",
        "Spot a train",
        "Share a link",
        "Report an incident",
      ]);
    });

    it("keeps every tile enabled and opens the picker for a line intent", async () => {
      await boot();

      expect(tile("chooser-tile-delay")?.disabled).toBe(false);
      await pickTile("chooser-tile-delay");

      expect(chooser.intent()).toBe("delay");
      expect(root().querySelector('[data-testid="chooser-line-picker"]')).not.toBeNull();
      expect(root().querySelector('[data-testid="chooser-tiles"]')).toBeNull();
      // The header says which question is being asked, and the footer offers a way back.
      expect(root().querySelector('[data-testid="chooser-heading"]')?.textContent?.trim()).toBe(
        "Which line?",
      );
      expect(root().querySelector('[data-testid="chooser-back"]')).not.toBeNull();
    });

    it("opens the link sheet directly and closes itself", async () => {
      await boot();

      await pickTile("chooser-tile-link");

      expect(linkSheet.open).toHaveBeenCalledTimes(1);
      expect(chooser.isOpen()).toBe(false);
      // No line, no navigation: a link is a link whatever train it was seen from.
      expect(lineStatusSheet.openFor).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    });

    it("opens the incident sheet BEFORE navigating, so it is open on arrival", async () => {
      await boot();

      await pickTile("chooser-tile-incident");

      // Order matters and is not observable through the arguments alone: the sheet is HOSTED by
      // /insiden, so it can only be open on arrival if it was opened before the router moved.
      expect(incidentSheet.open).toHaveBeenCalledTimes(1);
      expect(incidentSheet.open.mock.invocationCallOrder[0]).toBeLessThan(
        navigate.mock.invocationCallOrder[0],
      );
      expect(navigate).toHaveBeenCalledWith(["/insiden"]);
      expect(chooser.isOpen()).toBe(false);
    });

    it("goes back to the tiles without losing the sheet", async () => {
      await boot();
      await pickTile("chooser-tile-spot");

      (root().querySelector('[data-testid="chooser-back"]') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(chooser.isOpen()).toBe(true);
      expect(chooser.intent()).toBeNull();
      expect(root().querySelector('[data-testid="chooser-tiles"]')).not.toBeNull();
    });

    it("closes from Cancel on the tiles step", async () => {
      await boot();

      (root().querySelector('[data-testid="chooser-close"]') as HTMLButtonElement).click();

      expect(chooser.isOpen()).toBe(false);
    });
  });

  describe("the line picker", () => {
    it("opens the line-status sheet with the line and NO preset for a delay report", async () => {
      await boot();
      await pickTile("chooser-tile-delay");

      (root().querySelector('[data-testid="chooser-line-dead"]') as HTMLButtonElement).click();

      expect(lineStatusSheet.openFor).toHaveBeenCalledTimes(1);
      // One argument only: "delay / crowding" leaves the condition to the rider, because a delay and
      // a crush are the same tile and only they know which one they saw.
      expect(lineStatusSheet.openFor).toHaveBeenCalledWith("dead");
      expect(preferences.pushRecentLine).toHaveBeenCalledWith("dead");
      expect(chooser.isOpen()).toBe(false);
    });

    it("presets DISRUPTED for a stopped report, and creates no new status", async () => {
      await boot();
      await pickTile("chooser-tile-stopped");

      (root().querySelector('[data-testid="chooser-line-dead"]') as HTMLButtonElement).click();

      expect(lineStatusSheet.openFor).toHaveBeenCalledWith("dead", { presetStatus: "DISRUPTED" });
      expect(preferences.pushRecentLine).toHaveBeenCalledWith("dead");
      expect(chooser.isOpen()).toBe(false);
    });

    it("opens the spotting sheet scoped to the chosen line", async () => {
      await boot();
      await pickTile("chooser-tile-spot");

      (root().querySelector('[data-testid="chooser-line-ok2"]') as HTMLButtonElement).click();

      expect(reportSheet.openFor).toHaveBeenCalledWith("ok2");
      expect(lineStatusSheet.openFor).not.toHaveBeenCalled();
      expect(preferences.pushRecentLine).toHaveBeenCalledWith("ok2");
      expect(chooser.isOpen()).toBe(false);
    });

    it("orders pinned first, then recent, then severity", async () => {
      await boot();
      preferences.pinnedLineIds.set(["ok2"]);
      preferences.recentLineIds.set(["ok1"]);
      await pickTile("chooser-tile-delay");

      expect(listedLineIds()).toEqual(["ok2", "ok1", "dead"]);
    });

    it("shows each line's code, name and a compact status hint", async () => {
      await boot();
      await pickTile("chooser-tile-delay");

      const row = root().querySelector<HTMLElement>('[data-testid="chooser-line-dead"]');
      expect(row?.textContent?.replace(/\s+/g, " ")).toContain("DEAD · Line dead");
      // The hint is what makes a line recognisable in a glance: last reported condition + how much.
      expect(row?.querySelector('[data-testid="chooser-line-hint"]')?.textContent?.trim()).toBe(
        "Normal · 9 reports",
      );
      // …and the row names the line for a screen reader, which cannot see the colour dot.
      expect(row?.getAttribute("aria-label")).toBe("Report about DEAD Line dead");
    });

    it("narrows the list through the filter box without disturbing what survives", async () => {
      await boot();
      preferences.pinnedLineIds.set(["ok2"]);
      await pickTile("chooser-tile-delay");

      const filter = root().querySelector<HTMLInputElement>(
        '[data-testid="chooser-line-filter"]',
      ) as HTMLInputElement;
      expect(filter).not.toBeNull();
      filter.value = "ok";
      filter.dispatchEvent(new Event("input"));
      fixture.detectChanges();

      expect(listedLineIds()).toEqual(["ok2", "ok1"]);
      expect(filter.value).toBe("ok");
    });

    it("says so when the filter matches nothing rather than showing an empty box", async () => {
      await boot();
      await pickTile("chooser-tile-delay");

      const filter = root().querySelector<HTMLInputElement>(
        '[data-testid="chooser-line-filter"]',
      ) as HTMLInputElement;
      filter.value = "zzz";
      filter.dispatchEvent(new Event("input"));
      fixture.detectChanges();

      expect(listedLineIds()).toEqual([]);
      expect(root().querySelector('[data-testid="chooser-no-match"]')?.textContent).toContain(
        "zzz",
      );
      expect(root().querySelector('[data-testid="chooser-empty-lines"]')).toBeNull();
    });

    it("ignores a stray choice made with no intent pending", async () => {
      await boot();

      // The picker is not on screen, so this is unreachable through the UI — asserted because the
      // handler is the one place that could dispatch a report with no line chosen.
      const component = fixture.componentInstance as unknown as {
        onLineChosen(line: LinePulse): void;
      };
      component.onLineChosen(makeLine("ok1"));

      expect(lineStatusSheet.openFor).not.toHaveBeenCalled();
      expect(preferences.pushRecentLine).not.toHaveBeenCalled();
    });
  });

  describe("with no lines loaded", () => {
    it("disables the three line intents and leaves the other two alone", async () => {
      await boot();
      lines.set([]);
      fixture.detectChanges();

      expect(tile("chooser-tile-delay")?.disabled).toBe(true);
      expect(tile("chooser-tile-stopped")?.disabled).toBe(true);
      expect(tile("chooser-tile-spot")?.disabled).toBe(true);
      expect(tile("chooser-tile-link")?.disabled).toBe(false);
      expect(tile("chooser-tile-incident")?.disabled).toBe(false);
      expect(root().querySelector('[data-testid="chooser-no-lines"]')).not.toBeNull();
    });

    it("does not advance to a picker that could only be empty", async () => {
      await boot();
      lines.set([]);
      fixture.detectChanges();

      await pickTile("chooser-tile-delay");

      expect(chooser.intent()).toBeNull();
      expect(root().querySelector('[data-testid="chooser-line-picker"]')).toBeNull();
    });

    it("still opens the link sheet", async () => {
      await boot();
      lines.set([]);
      fixture.detectChanges();

      await pickTile("chooser-tile-link");

      expect(linkSheet.open).toHaveBeenCalledTimes(1);
    });
  });

  it("docks to the right on a wide viewport and to the bottom on a narrow one", async () => {
    await boot(true);
    expect(
      (fixture.debugElement.query(By.directive(HlmSheet)).componentInstance as HlmSheet).side(),
    ).toBe("right");

    await boot(false);
    expect(
      (fixture.debugElement.query(By.directive(HlmSheet)).componentInstance as HlmSheet).side(),
    ).toBe("bottom");
  });
});
