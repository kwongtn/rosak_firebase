import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SpottingActivityHeatmap } from "./spotting-activity-heatmap";

class FakeObserver {
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
}

describe("SpottingActivityHeatmap smoke", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", FakeObserver);
    vi.stubGlobal("requestAnimationFrame", (_cb: FrameRequestCallback) => 0);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates and renders without throwing", async () => {
    await TestBed.configureTestingModule({
      imports: [SpottingActivityHeatmap],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture: ComponentFixture<SpottingActivityHeatmap> =
      TestBed.createComponent(SpottingActivityHeatmap);
    fixture.componentRef.setInput("data", []);
    fixture.componentRef.setInput("totalAllTime", 0);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance).toBeTruthy();
  });
});
