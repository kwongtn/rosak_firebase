import { Component, provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { HlmSheetBody } from "./sheet";

@Component({
  imports: [HlmSheetBody],
  template: `<div hlmSheetBody [scrollable]="scrollable()" data-testid="body">content</div>`,
})
class BodyHostComponent {
  readonly scrollable = signal(true);
}

describe("HlmSheetBody scrollable", () => {
  let fixture: ComponentFixture<BodyHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BodyHostComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(BodyHostComponent);
    fixture.detectChanges();
  });

  function body(): HTMLElement {
    const el = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '[data-testid="body"]',
    );
    if (!el) throw new Error("sheet body not rendered");
    return el;
  }

  it("scrolls by default, with no fill-height flex column", () => {
    const el = body();
    expect(el.classList.contains("overflow-y-auto")).toBe(true);
    expect(el.classList.contains("overflow-hidden")).toBe(false);
    expect(el.classList.contains("flex")).toBe(false);
    expect(el.classList.contains("flex-col")).toBe(false);
  });

  it("becomes a non-scrolling flex column when scrollable is false", () => {
    fixture.componentInstance.scrollable.set(false);
    fixture.detectChanges();

    const el = body();
    expect(el.classList.contains("overflow-hidden")).toBe(true);
    expect(el.classList.contains("overflow-y-auto")).toBe(false);
    expect(el.classList.contains("flex")).toBe(true);
    expect(el.classList.contains("flex-col")).toBe(true);
    // Still the panel's flex child — fill-height sheets rely on this.
    expect(el.classList.contains("flex-1")).toBe(true);
  });
});
