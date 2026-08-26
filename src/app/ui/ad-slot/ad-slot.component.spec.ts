import { type WritableSignal, PLATFORM_ID, provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type AdFillState,
  AdSlotComponent,
  isAdPreviewEnabled,
  mapAdStatus,
} from "./ad-slot.component";

describe("isAdPreviewEnabled", () => {
  it("is true when ?adpreview=1 is present", () => {
    expect(isAdPreviewEnabled("?adpreview=1")).toBe(true);
  });

  it("is true when the param appears alongside others", () => {
    expect(isAdPreviewEnabled("?foo=bar&adpreview=1&baz=qux")).toBe(true);
  });

  it("is false when the param is absent", () => {
    expect(isAdPreviewEnabled("")).toBe(false);
    expect(isAdPreviewEnabled("?foo=bar")).toBe(false);
  });
});

describe("mapAdStatus", () => {
  it('maps "filled" to filled', () => {
    expect(mapAdStatus("filled")).toBe("filled");
  });

  it('maps "unfilled" to unfilled', () => {
    expect(mapAdStatus("unfilled")).toBe("unfilled");
  });

  it("maps anything else to pending", () => {
    expect(mapAdStatus(null)).toBe("pending");
    expect(mapAdStatus(undefined)).toBe("pending");
    expect(mapAdStatus("weird")).toBe("pending");
    expect(mapAdStatus("")).toBe("pending");
  });
});

/**
 * jsdom ships neither observer; the component constructs both browser-side inside
 * `afterNextRender`, so they must exist before the first fixture render.
 */
class FakeObserver {
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
}

interface SlotInputs {
  slotId?: string;
  label?: string;
  placeholder?: boolean;
}

/** Renders the slot through one full client cycle: `afterNextRender` flips `render` only after
 * the first pass, so detect → settle → detect before any assertion. */
async function renderSlot(inputs: SlotInputs = {}): Promise<ComponentFixture<AdSlotComponent>> {
  const fixture = TestBed.createComponent(AdSlotComponent);
  fixture.componentRef.setInput("slotId", inputs.slotId);
  fixture.componentRef.setInput("label", inputs.label);
  fixture.componentRef.setInput("placeholder", inputs.placeholder ?? false);
  fixture.componentRef.setInput("minHeightPx", 250);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function wrapperOf(fixture: ComponentFixture<AdSlotComponent>): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector("div");
}

function setFillState(fixture: ComponentFixture<AdSlotComponent>, state: AdFillState): void {
  (
    fixture.componentInstance as unknown as { fillState: WritableSignal<AdFillState> }
  ).fillState.set(state);
  fixture.detectChanges();
}

describe("AdSlotComponent (client)", () => {
  beforeEach(async () => {
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    vi.stubGlobal("MutationObserver", FakeObserver);
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [AdSlotComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders zero DOM footprint when unconfigured (no slotId, placeholder off)", async () => {
    const fixture = await renderSlot();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.children.length).toBe(0);
    expect(host.querySelector("div")).toBeNull();
  });

  it("always shows the dashed QA placeholder box while pending (regression lock)", async () => {
    const fixture = await renderSlot({ placeholder: true });

    const wrapper = wrapperOf(fixture);
    expect(wrapper).not.toBeNull();
    expect(wrapper?.classList.contains("invisible")).toBe(false);
    expect(wrapper?.classList.contains("hidden")).toBe(false);
    expect(wrapper?.classList.contains("border-border/60")).toBe(true);
    expect(wrapper?.classList.contains("bg-background")).toBe(true);
    expect(wrapper?.classList.contains("border")).toBe(true);
    expect(wrapper?.querySelector(".border-dashed")).not.toBeNull();
  });

  it("keeps a real slot invisible and unlabeled while pending", async () => {
    const fixture = await renderSlot({ slotId: "3724291191", label: "Advertisement" });

    const wrapper = wrapperOf(fixture);
    expect(wrapper).not.toBeNull();
    expect(wrapper?.classList.contains("invisible")).toBe(true);
    expect(wrapper?.classList.contains("hidden")).toBe(false);
    expect(wrapper?.classList.contains("border")).toBe(false);
    expect(wrapper?.querySelector(".adsbygoogle")).not.toBeNull();
    expect(wrapper?.textContent).not.toContain("Advertisement");
  });

  it("reveals chrome and the label caption once the unit fills", async () => {
    const fixture = await renderSlot({ slotId: "3724291191", label: "Advertisement" });

    setFillState(fixture, "filled");

    const wrapper = wrapperOf(fixture);
    expect(wrapper?.classList.contains("invisible")).toBe(false);
    expect(wrapper?.classList.contains("hidden")).toBe(false);
    expect(wrapper?.classList.contains("border-border/60")).toBe(true);
    expect(wrapper?.classList.contains("bg-background")).toBe(true);
    expect(wrapper?.classList.contains("border")).toBe(true);
    expect(wrapper?.textContent).toContain("Advertisement");
  });

  it("collapses the whole unit with hidden once AdSense reports it unfilled", async () => {
    const fixture = await renderSlot({ slotId: "3724291191" });

    setFillState(fixture, "unfilled");

    const wrapper = wrapperOf(fixture);
    expect(wrapper).not.toBeNull();
    expect(wrapper?.classList.contains("hidden")).toBe(true);
    expect(wrapper?.classList.contains("invisible")).toBe(false);
  });

  it("caps the reserved block at minHeightPx with overflow-hidden regardless of fill state", async () => {
    const fixture = await renderSlot({ slotId: "3724291191" });
    const states: AdFillState[] = ["pending", "filled", "unfilled"];

    for (const state of states) {
      setFillState(fixture, state);

      const wrapper = wrapperOf(fixture);
      expect(wrapper).not.toBeNull();
      expect(wrapper?.style.height).toBe("250px");
      expect(wrapper?.classList.contains("overflow-hidden")).toBe(true);
    }
  });
});

describe("AdSlotComponent (server)", () => {
  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [AdSlotComponent],
      providers: [provideZonelessChangeDetection(), { provide: PLATFORM_ID, useValue: "server" }],
    }).compileComponents();
  });

  it("emits zero element nodes so SSR output never contains ad DOM", async () => {
    const fixture = TestBed.createComponent(AdSlotComponent);
    fixture.componentRef.setInput("slotId", "3724291191");
    fixture.componentRef.setInput("minHeightPx", 250);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelectorAll("*").length).toBe(0);
    expect(host.querySelector("div")).toBeNull();
  });
});
