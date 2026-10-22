import { Component, provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { HlmSheet } from "./sheet";

@Component({
  imports: [HlmSheet],
  template: `
    <hlm-sheet [(open)]="first" side="bottom" data-testid="first">first</hlm-sheet>
    @if (showSecond()) {
      <hlm-sheet [(open)]="second" side="bottom" data-testid="second">second</hlm-sheet>
    }
  `,
})
class TwoSheetsHostComponent {
  readonly first = signal(false);
  readonly second = signal(false);
  readonly showSecond = signal(true);
}

describe("HlmSheet shared scroll lock", () => {
  let fixture: ComponentFixture<TwoSheetsHostComponent>;
  let host: TwoSheetsHostComponent;

  const locked = (): boolean =>
    document.body.style.overflow === "hidden" &&
    document.documentElement.style.overflow === "hidden";
  const unlocked = (): boolean =>
    document.body.style.overflow === "" && document.documentElement.style.overflow === "";

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(TwoSheetsHostComponent);
    host = fixture.componentInstance;
    await settle();
  });

  // The host's own inline overflow would otherwise leak into sibling suites.
  afterEach(() => {
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
  });

  it("stays locked when one of two open sheets closes, and unlocks when both have", async () => {
    host.first.set(true);
    host.second.set(true);
    await settle();
    expect(locked()).toBe(true);

    host.first.set(false);
    await settle();
    expect(locked()).toBe(true);

    host.second.set(false);
    await settle();
    expect(unlocked()).toBe(true);
  });

  it("stays locked when the sheet created LATER opens in the tick the earlier one closes", async () => {
    host.first.set(true);
    await settle();

    host.first.set(false);
    host.second.set(true);
    await settle();

    expect(locked()).toBe(true);
  });

  it("stays locked when the sheet created EARLIER opens in the tick the later one closes", async () => {
    // The order the old per-sheet effects got wrong: the later sheet's unlock ran last.
    host.second.set(true);
    await settle();

    host.second.set(false);
    host.first.set(true);
    await settle();

    expect(locked()).toBe(true);
  });

  it("releases only its own hold when an open sheet is destroyed", async () => {
    host.first.set(true);
    host.second.set(true);
    await settle();

    host.showSecond.set(false);
    await settle();
    expect(locked()).toBe(true);

    fixture.destroy();
    expect(unlocked()).toBe(true);
  });

  it("does not release twice for a sheet that closed and is then destroyed", async () => {
    host.first.set(true);
    host.second.set(true);
    await settle();

    host.second.set(false);
    await settle();
    host.showSecond.set(false);
    await settle();

    expect(locked()).toBe(true);
  });
});

describe("HlmSheet scrim layering", () => {
  afterEach(() => {
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
  });

  it("paints the scrim above the sticky nav (z-45) and below the panel (z-50)", async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(TwoSheetsHostComponent);
    fixture.componentInstance.first.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    const scrim = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '[data-testid="first"] > div',
    );
    if (!scrim) throw new Error("scrim not rendered");
    const z = /(?:^|\s)z-\[?(\d+)\]?(?:\s|$)/.exec(scrim.className)?.[1];

    expect(Number(z)).toBeGreaterThan(45);
    expect(Number(z)).toBeLessThan(50);
  });
});
