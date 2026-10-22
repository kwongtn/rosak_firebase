import { Component, provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { HlmSheet, HlmSheetBody } from "./sheet";

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

@Component({
  imports: [HlmSheet],
  template: `<hlm-sheet [(open)]="open" side="bottom">content</hlm-sheet>`,
})
class SheetHostComponent {
  readonly open = signal(false);
}

describe("HlmSheet scroll lock", () => {
  let fixture: ComponentFixture<SheetHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SheetHostComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(SheetHostComponent);
    fixture.detectChanges();
  });

  // The host's own inline overflow would otherwise leak into sibling suites.
  afterEach(() => {
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
  });

  it("hides the root scrollbar while open and restores it on close", () => {
    expect(document.documentElement.style.overflow).toBe("");

    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.style.overflow).toBe("hidden");

    fixture.componentInstance.open.set(false);
    fixture.detectChanges();
    expect(document.documentElement.style.overflow).toBe("");
    expect(document.body.style.overflow).toBe("");
  });

  it("restores the root overflow on destroy", () => {
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    expect(document.documentElement.style.overflow).toBe("hidden");

    fixture.destroy();
    expect(document.documentElement.style.overflow).toBe("");
    expect(document.body.style.overflow).toBe("");
  });
});

@Component({
  imports: [HlmSheet],
  template: `
    <hlm-sheet [(open)]="open" side="bottom">
      <button type="button" data-testid="inside">Inside</button>
    </hlm-sheet>
  `,
})
class TrapHostComponent {
  readonly open = signal(true);
}

describe("HlmSheet once closed", () => {
  let fixture: ComponentFixture<TrapHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TrapHostComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(TrapHostComponent);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
  });

  const host = () => fixture.nativeElement as HTMLElement;
  /** The two focus-trap anchors CDK puts on either side of the panel. */
  const anchors = () => Array.from(host().querySelectorAll<HTMLElement>(".cdk-focus-trap-anchor"));
  const panel = () => host().querySelector<HTMLElement>('[data-testid="inside"]')!.parentElement!;

  async function setOpen(open: boolean): Promise<void> {
    fixture.componentInstance.open.set(open);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it("takes the trap's anchors out of the tab order and makes the panel inert", async () => {
    expect(anchors()).toHaveLength(2);
    expect(anchors().map((anchor) => anchor.getAttribute("tabindex"))).toEqual(["0", "0"]);
    expect(panel().hasAttribute("inert")).toBe(false);

    await setOpen(false);

    // Still mounted, so it can slide out, but Tab can no longer land on an anchor that sends focus
    // into the hidden panel, and the panel's content is out of the accessibility tree.
    expect(anchors()).toHaveLength(2);
    expect(anchors().some((anchor) => anchor.hasAttribute("tabindex"))).toBe(false);
    expect(panel().hasAttribute("inert")).toBe(true);
  });

  it("puts both back when it opens again", async () => {
    await setOpen(false);
    await setOpen(true);

    expect(anchors().map((anchor) => anchor.getAttribute("tabindex"))).toEqual(["0", "0"]);
    expect(panel().hasAttribute("inert")).toBe(false);
  });
});
