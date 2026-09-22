import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PASSENGER_INFO, passengerScale, type StatusInfo } from "../../home/data/status-info.util";
import { StatusInfoChipComponent } from "./status-info-chip.component";

/**
 * jsdom provides no `matchMedia` (same trap as compact-nav's ThemeService spec), so the chip's
 * `afterNextRender` capability probe is stubbed per test — before the first render, since that's
 * when the probe runs.
 */
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

interface RenderOptions {
  info?: StatusInfo;
  scale?: ReturnType<typeof passengerScale>;
}

describe("StatusInfoChipComponent", () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatusInfoChipComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function render(
    options: RenderOptions = {},
  ): Promise<ComponentFixture<StatusInfoChipComponent>> {
    const fixture = TestBed.createComponent(StatusInfoChipComponent);
    fixture.componentRef.setInput("info", options.info ?? PASSENGER_INFO.CROWDED);
    if (options.scale) {
      fixture.componentRef.setInput("scale", options.scale);
    }
    // afterNextRender flips `_hoverCapable` only after one full cycle — detect, settle, detect.
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function host(fixture: ComponentFixture<StatusInfoChipComponent>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function trigger(fixture: ComponentFixture<StatusInfoChipComponent>): HTMLElement {
    return host(fixture).querySelector<HTMLElement>('[role="button"]') as HTMLElement;
  }

  function popover(fixture: ComponentFixture<StatusInfoChipComponent>): HTMLElement | null {
    return host(fixture).querySelector<HTMLElement>('[data-testid="status-info-popover"]');
  }

  function hover(fixture: ComponentFixture<StatusInfoChipComponent>): void {
    trigger(fixture).dispatchEvent(new MouseEvent("mouseenter"));
    fixture.detectChanges();
  }

  it("stays hidden until the chip is hovered, focused or tapped", async () => {
    stubMatchMedia(true);
    const fixture = await render();

    expect(popover(fixture)).toBeNull();
    expect(trigger(fixture).getAttribute("aria-expanded")).toBe("false");
  });

  it("shows on hover and hides on mouseleave when the device is hover-capable", async () => {
    stubMatchMedia(true);
    const fixture = await render();

    hover(fixture);
    expect(popover(fixture)).not.toBeNull();
    expect(trigger(fixture).getAttribute("aria-expanded")).toBe("true");

    trigger(fixture).dispatchEvent(new MouseEvent("mouseleave"));
    fixture.detectChanges();
    expect(popover(fixture)).toBeNull();
  });

  it("does not toggle on click when the device is hover-capable", async () => {
    stubMatchMedia(true);
    const fixture = await render();

    trigger(fixture).click();
    fixture.detectChanges();
    expect(popover(fixture)).toBeNull();

    hover(fixture);
    trigger(fixture).click();
    fixture.detectChanges();
    expect(popover(fixture)).not.toBeNull();
  });

  it("toggles on click when the device has no real hover", async () => {
    stubMatchMedia(false);
    const fixture = await render();

    trigger(fixture).click();
    fixture.detectChanges();
    expect(popover(fixture)).not.toBeNull();
    expect(trigger(fixture).getAttribute("aria-expanded")).toBe("true");

    trigger(fixture).click();
    fixture.detectChanges();
    expect(popover(fixture)).toBeNull();
    expect(trigger(fixture).getAttribute("aria-expanded")).toBe("false");
  });

  it("shows on focus and hides on blur", async () => {
    stubMatchMedia(true);
    const fixture = await render();

    trigger(fixture).dispatchEvent(new FocusEvent("focus"));
    fixture.detectChanges();
    expect(popover(fixture)).not.toBeNull();

    trigger(fixture).dispatchEvent(new FocusEvent("blur"));
    fixture.detectChanges();
    expect(popover(fixture)).toBeNull();
  });

  it("renders the title and one-line explanation of the status", async () => {
    stubMatchMedia(true);
    const fixture = await render({ info: PASSENGER_INFO.DISRUPTED });

    hover(fixture);
    const text = (popover(fixture)?.textContent ?? "").replace(/\s+/g, " ").trim();

    expect(text).toContain("Disrupted");
    expect(text).toContain("Service is disrupted; expect significant delays.");
  });

  it("renders the 7-level legend with only the active level emphasised", async () => {
    stubMatchMedia(true);
    const fixture = await render({
      info: PASSENGER_INFO.CROWDED,
      scale: passengerScale("CROWDED"),
    });

    hover(fixture);
    const rows = host(fixture).querySelectorAll('[data-testid="status-scale-entry"]');
    expect(rows).toHaveLength(7);

    const active = host(fixture).querySelectorAll(
      '[data-testid="status-scale-entry"][data-active="true"]',
    );
    expect(active).toHaveLength(1);
    expect(active[0]?.textContent?.trim()).toBe("Crowded");
  });
});
