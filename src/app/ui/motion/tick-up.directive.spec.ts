import { Component, signal } from "@angular/core";
import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { HlmTickUp } from "./tick-up.directive";

/** The one class the directive owns. Mirrors the constant; kept literal so a rename cannot silently
 *  make this spec pass against a class nothing renders. */
const TICK_CLASS = "motion-safe:animate-tick-up";

@Component({
  imports: [HlmTickUp],
  template: `<span [hlmTickUp]="value()">{{ value() }}</span>`,
})
class HostComponent {
  readonly value = signal(7);
}

describe("HlmTickUp", () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideZonelessChangeDetection()],
    });
  });

  function element(): HTMLElement {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture.nativeElement.querySelector("span") as HTMLElement;
  }

  it("renders the bound number as plain text, with the class absent", () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const span = fixture.nativeElement.querySelector("span") as HTMLElement;

    expect(span.textContent?.trim()).toBe("7");
    expect(span.classList.contains(TICK_CLASS)).toBe(false);
  });

  // The first paint is the one moment nobody asked for motion: the numbers are simply how the page
  // found the network. Animating them on arrival would also fight the webfont swap on a cold cache.
  it("never animates on FIRST paint, even though the class could be applied", () => {
    const span = element();

    expect(span.classList.contains(TICK_CLASS)).toBe(false);
  });

  it("replays the reveal when the value changes", () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const span = fixture.nativeElement.querySelector("span") as HTMLElement;

    fixture.componentInstance.value.set(8);
    fixture.detectChanges();

    expect(span.classList.contains(TICK_CLASS)).toBe(true);
  });

  // A live page's numbers move every poll beat. Each move is a NEW animation rather than one that
  // has already run, which is the whole reason the directive removes and re-adds the class instead
  // of leaving it in place.
  it("replays again on a SECOND change", () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const span = fixture.nativeElement.querySelector("span") as HTMLElement;

    fixture.componentInstance.value.set(9);
    fixture.detectChanges();
    span.classList.remove(TICK_CLASS);

    fixture.componentInstance.value.set(10);
    fixture.detectChanges();

    expect(span.classList.contains(TICK_CLASS)).toBe(true);
  });

  // Most tiles on most pages never change. An unrelated re-render must not make a static number
  // move, or the whole hero twitches every time anything on the page updates.
  it("leaves the number alone when something ELSE re-renders", () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const span = fixture.nativeElement.querySelector("span") as HTMLElement;

    fixture.detectChanges();
    fixture.detectChanges();

    expect(span.classList.contains(TICK_CLASS)).toBe(false);
  });

  // `motion-safe:` is the entire reduced-motion contract — the variant does not match under
  // `prefers-reduced-motion: reduce`, so the class is inert there and the element stays put.
  it("carries the class under the motion-safe variant", () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    fixture.componentInstance.value.set(1);
    fixture.detectChanges();

    const span = fixture.nativeElement.querySelector("span") as HTMLElement;
    expect(span.getAttribute("class")).toContain("motion-safe:");
    expect(span.classList.contains(TICK_CLASS)).toBe(true);
  });
});
