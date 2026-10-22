import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { METHODOLOGY_SECTIONS, METRIC_DOCS } from "../../core/methodology/methodology.content";
import { MethodologySectionComponent } from "./methodology-section.component";

/** The section with the most metrics, so the per-metric dates are many and not all the same. */
const SECTION = METHODOLOGY_SECTIONS.map((entry) => ({
  entry,
  docs: METRIC_DOCS.filter((doc) => doc.sectionId === entry.id),
})).sort((a, b) => b.docs.length - a.docs.length)[0];

describe("MethodologySectionComponent review dates", () => {
  let fixture: ComponentFixture<MethodologySectionComponent>;
  let root: HTMLElement;

  /** Renders the section with the clock at `today`. Only `Date` is faked, so rendering is unaffected. */
  async function render(today: string): Promise<void> {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(today));
    fixture = TestBed.createComponent(MethodologySectionComponent);
    fixture.componentRef.setInput("section", SECTION.entry);
    fixture.detectChanges();
    await fixture.whenStable();
    root = fixture.nativeElement as HTMLElement;
  }

  const rows = (): HTMLElement[] => [...root.querySelectorAll<HTMLElement>("li")];
  const pills = (el: ParentNode): NodeListOf<Element> =>
    el.querySelectorAll('[data-testid="needs-review"]');

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MethodologySectionComponent],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    }).compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
    vi.useRealTimers();
  });

  it("has several metrics to tell apart", () => {
    expect(SECTION.docs.length).toBeGreaterThan(1);
  });

  it("shows each metric's own review date beside it, not the section's", async () => {
    await render("2026-10-22T12:00:00Z");

    expect(rows()).toHaveLength(SECTION.docs.length);
    SECTION.docs.forEach((doc, index) => {
      const shown = rows()[index].querySelector('[data-testid="metric-reviewed"]');
      expect(shown?.textContent?.trim(), doc.id).toBe(`Reviewed ${doc.lastReviewed}`);
    });
  });

  it("marks nothing for review while every date is recent", async () => {
    await render("2026-10-22T12:00:00Z");

    expect(pills(root)).toHaveLength(0);
  });

  it("marks the section and every metric once their dates are more than six months old", async () => {
    await render("2030-01-01T00:00:00Z");

    expect(pills(root)).toHaveLength(1 + SECTION.docs.length);
    expect(pills(root.querySelector("h2")!.parentElement!)).toHaveLength(1);
    for (const row of rows()) {
      expect(pills(row)).toHaveLength(1);
      expect(pills(row)[0].textContent?.trim()).toBe("Needs review");
    }
  });
});
