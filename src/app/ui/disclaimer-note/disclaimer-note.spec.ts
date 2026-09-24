import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { DisclaimerNote, type DisclaimerVariant } from "./disclaimer-note";

/**
 * The canonical copy from METHODOLOGY_DOCS.md §5. This literal set is the contract: any
 * rewrite of a sentence here must be a deliberate companion edit to the spec, never a
 * drive-by "improvement" that drifts the one shared disclaimer.
 */
const CANONICAL_SENTENCES = [
  "MLPTF is an independent community project.",
  "We are not affiliated with Prasarana Malaysia, RapidKL, MRT Corp, or any transit operator.",
  "Figures here are estimates derived from official operator posts, community reports, and published schedules — they can be wrong or incomplete, and they are not official operator data.",
  "Rail positions and arrival times are schedule-derived, not live GPS or GTFS-Realtime.",
  "Do not use this site for safety-critical decisions.",
] as const;

describe("DisclaimerNote", () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DisclaimerNote],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  async function render(variant?: DisclaimerVariant): Promise<ComponentFixture<DisclaimerNote>> {
    const fixture = TestBed.createComponent(DisclaimerNote);
    if (variant !== undefined) {
      fixture.componentRef.setInput("variant", variant);
    }
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function note(fixture: ComponentFixture<DisclaimerNote>): HTMLElement {
    const el = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '[data-testid="disclaimer-note"]',
    );
    if (!el) throw new Error("disclaimer note not rendered");
    return el;
  }

  /** Angular collapses the template's line breaks to single spaces; normalise the same way so
   * the assertion survives any prettier-driven re-wrap of the copy. */
  function textOf(fixture: ComponentFixture<DisclaimerNote>): string {
    return (note(fixture).textContent ?? "").replace(/\s+/g, " ").trim();
  }

  for (const variant of ["inline", "footer"] as const) {
    it(`renders the complete canonical disclaimer in the "${variant}" variant`, async () => {
      const fixture = await render(variant);

      expect(textOf(fixture)).toBe(CANONICAL_SENTENCES.join(" "));
    });
  }

  for (const variant of ["inline", "footer"] as const) {
    it(`keeps every canonical sentence addressable in the "${variant}" variant`, async () => {
      const fixture = await render(variant);
      const text = textOf(fixture);

      for (const sentence of CANONICAL_SENTENCES) {
        expect(text).toContain(sentence);
      }
    });
  }

  it("defaults to the framed inline presentation", async () => {
    const el = note(await render());

    expect(el.classList.contains("rounded-lg")).toBe(true);
    expect(el.classList.contains("border")).toBe(true);
    expect(el.classList.contains("bg-muted/40")).toBe(true);
  });

  it("drops the frame and keeps only a top rule for the footer variant", async () => {
    const el = note(await render("footer"));

    expect(el.classList.contains("border-t")).toBe(true);
    expect(el.classList.contains("rounded-lg")).toBe(false);
    expect(el.classList.contains("bg-muted/40")).toBe(false);
  });
});
