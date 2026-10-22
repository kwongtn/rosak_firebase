import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { metricDoc } from "../../../core/methodology/methodology-render.util";
import { PreferencesService } from "../../../core/preferences/preferences.service";
import { LinePulse } from "./home-board.queries";
import { injectLinePulseView } from "./line-pulse-view";
import { vehicleBreakdownRows, vehicleCountInfo } from "./status-info.util";

function makeLine(overrides: Partial<LinePulse> = {}): LinePulse {
  return {
    id: "line-1",
    code: "KJL",
    displayName: "Kelana Jaya Line",
    displayColor: "#e11d48",
    status: "ACTIVE",
    inServiceVehicleCount: 12,
    totalVehicleCount: 16,
    passengerStatus: "NORMAL",
    statusReportCount: 0,
    vehicleStatusCounts: [{ status: "IN_SERVICE", count: 12 }],
    passengerStatusCount: 0,
    passengerStatusCounts: [],
    statusWindowMinutes: 15,
    pulseLinks: [],
    ...overrides,
  };
}

describe("injectLinePulseView", () => {
  const pinned = signal(new Set<string>());
  const preferences = {
    isPinned: (lineId: string) => pinned().has(lineId),
    togglePin: vi.fn(),
    pushRecentLine: vi.fn(),
  };

  beforeEach(() => {
    pinned.set(new Set());
    preferences.togglePin.mockReset();
    preferences.pushRecentLine.mockReset();
    TestBed.configureTestingModule({
      providers: [{ provide: PreferencesService, useValue: preferences }],
    });
  });

  function setup(line = makeLine()) {
    const lineSignal = signal(line);
    const view = TestBed.runInInjectionContext(() =>
      injectLinePulseView(lineSignal, "line-card-expanded"),
    );
    return { view, lineSignal };
  }

  it("scopes the panel id to the surface prefix and the current line", () => {
    const { view, lineSignal } = setup();

    expect(view.expandedPanelId()).toBe("line-card-expanded-line-1");

    lineSignal.set(makeLine({ id: "line-2" }));

    expect(view.expandedPanelId()).toBe("line-card-expanded-line-2");
  });

  it("toggles the panel and records the line as recent on the open edge only", () => {
    const { view } = setup();

    view.toggleExpanded();

    expect(view.expanded()).toBe(true);
    expect(preferences.pushRecentLine).toHaveBeenCalledTimes(1);
    expect(preferences.pushRecentLine).toHaveBeenCalledWith("line-1");

    view.toggleExpanded();

    expect(view.expanded()).toBe(false);
    expect(preferences.pushRecentLine).toHaveBeenCalledTimes(1);
  });

  it("follows the pin state for the flag and the tooltip copy, and forwards the toggle", () => {
    const { view } = setup();

    expect(view.isPinned()).toBe(false);
    expect(view.pinHintTitle()).toBe("Click to pin");
    expect(view.pinHint()).toContain("Pin this line");

    pinned.set(new Set(["line-1"]));

    expect(view.isPinned()).toBe(true);
    expect(view.pinHintTitle()).toBe("Click to unpin");
    expect(view.pinHint()).toContain("Unpin this line");

    view.togglePin();

    expect(preferences.togglePin).toHaveBeenCalledWith("line-1");
  });

  it("derives the fleet label and the confidence level from the line", () => {
    const { view, lineSignal } = setup();

    expect(view.vehicleCountLabel()).toBe("12 of 16 vehicles in service");
    expect(view.confidence().level).toBe("none");
    const noneTitle = view.confidenceInfo().title;
    expect(noneTitle).toBe(metricDoc(view.confidence().metricId).title);

    lineSignal.set(
      makeLine({
        pulseLinks: [
          {
            id: "p1",
            url: "https://example.com/p1",
            title: "Notice",
            created: "2026-08-01T08:00:00",
            isAutomated: true,
          },
        ],
      }),
    );

    expect(view.confidence().level).toBe("official");
    // The popover follows the resolved level's own metric, not a fixed one.
    expect(view.confidenceInfo().title).toBe(metricDoc(view.confidence().metricId).title);
    expect(view.confidenceInfo().title).not.toBe(noneTitle);
  });

  it("builds the fleet popover and breakdown rows from the registry and the line's counts", () => {
    const counts: LinePulse["vehicleStatusCounts"] = [
      { status: "IN_SERVICE", count: 12 },
      { status: "OUT_OF_SERVICE", count: 4 },
    ];
    const { view, lineSignal } = setup(makeLine({ vehicleStatusCounts: counts }));

    expect(view.vehicleCountInfo()).toEqual(vehicleCountInfo());
    expect(view.vehicleBreakdown()).toEqual(vehicleBreakdownRows(counts));
    expect(view.vehicleBreakdown().at(-1)).toEqual({ key: "TOTAL", label: "Total", value: "16" });

    lineSignal.set(makeLine({ vehicleStatusCounts: [] }));

    expect(view.vehicleBreakdown()).toEqual([]);
  });
});
