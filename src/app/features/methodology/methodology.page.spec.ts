import { CUSTOM_ELEMENTS_SCHEMA, provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By, Meta } from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import { beforeEach, describe, expect, it } from "vitest";

import { METRIC_DOCS, METHODOLOGY_SECTIONS } from "../../core/methodology/methodology.content";
import { renderMethodologyCopy } from "../../core/methodology/methodology-render.util";
import { AppFooterComponent } from "../../shell/app-footer/app-footer.component";
import { AppNavComponent } from "../../shell/app-nav/app-nav.component";
import { InfoPopover } from "../../ui/info-popover/info-popover";
import { MethodologyPage } from "./methodology.page";
import { MethodologySectionComponent } from "./methodology-section.component";

/**
 * Composition test for `/methodology`: the registry is the contract, so every expected value
 * (section ids, headings, dates, owner routes, metric counts and popover copy) is derived from
 * `METHODOLOGY_SECTIONS` / `METRIC_DOCS` at test time rather than hardcoded here — a sibling task
 * may add a metric doc without touching this spec.
 */
describe("methodology page", () => {
  let fixture: ComponentFixture<MethodologyPage>;
  let root: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MethodologyPage],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    })
      // The shell (nav/footer) drags in Firestore-shaped deps and a version poll this
      // composition test doesn't care about — drop them and allow the tags as inert elements,
      // the same pattern home.page.spec.ts uses.
      .overrideComponent(MethodologyPage, {
        remove: { imports: [AppNavComponent, AppFooterComponent] },
        add: { schemas: [CUSTOM_ELEMENTS_SCHEMA] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(MethodologyPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    root = fixture.nativeElement as HTMLElement;
  });

  function sectionEl(id: string): HTMLElement {
    const el = root.querySelector<HTMLElement>(`section[id="${id}"]`);
    if (!el) throw new Error(`section #${id} not rendered`);
    return el;
  }

  function textOf(el: HTMLElement): string {
    return (el.textContent ?? "").replace(/\s+/g, " ").trim();
  }

  it("renders the h1 and sets a one-paragraph meta description", () => {
    expect(root.querySelector("h1")?.textContent?.trim()).toBe("How this is counted");

    const description =
      TestBed.inject(Meta).getTag('name="description"')?.getAttribute("content") ?? "";
    expect(description.length).toBeGreaterThan(40);
    expect(description).not.toContain("{{");
  });

  it("renders every registry section, in order, with its heading and last-reviewed date", () => {
    expect([...root.querySelectorAll("section[id]")].map((el) => el.id)).toEqual(
      METHODOLOGY_SECTIONS.map((entry) => entry.id),
    );

    for (const entry of METHODOLOGY_SECTIONS) {
      const el = sectionEl(entry.id);
      const heading = [...el.querySelectorAll("h2")].find(
        (candidate) => textOf(candidate as HTMLElement) === entry.title,
      );
      expect(heading, entry.id).toBeDefined();
      expect(textOf(el), entry.id).toContain(`Last reviewed ${entry.lastReviewed}`);
    }
  });

  it("links each owned section to its feature route and names the owning spec otherwise", () => {
    for (const entry of METHODOLOGY_SECTIONS) {
      const el = sectionEl(entry.id);
      if (entry.ownerRoute !== null) {
        expect(el.querySelector(`a[href="${entry.ownerRoute}"]`), entry.id).not.toBeNull();
      } else {
        expect(el.querySelector("a"), entry.id).toBeNull();
        expect(textOf(el), entry.id).toContain(entry.sourceSpec);
      }
    }
  });

  it("renders the sources section in progress, naming DATA_PROVENANCE.md", () => {
    const note = sectionEl("sources").querySelector('[data-testid="in-progress"]');
    expect(note).not.toBeNull();
    expect(textOf(note as HTMLElement)).toContain("DATA_PROVENANCE.md");
  });

  it("renders every in-progress section's owning spec, with no unresolved token anywhere", () => {
    for (const entry of METHODOLOGY_SECTIONS.filter((section) => section.inProgress)) {
      const el = sectionEl(entry.id);
      expect(el.querySelector('[data-testid="in-progress"]'), entry.id).not.toBeNull();
      expect(textOf(el), entry.id).toContain(entry.sourceSpec);
    }
    expect(textOf(root)).not.toContain("{{");
  });

  it("renders the disclaimer directly under the h1 and again as the last block", () => {
    const notes = [...root.querySelectorAll<HTMLElement>('[data-testid="disclaimer-note"]')];
    expect(notes.length).toBe(2);

    const firstSection = sectionEl(METHODOLOGY_SECTIONS[0].id);
    const lastSection = sectionEl(METHODOLOGY_SECTIONS[METHODOLOGY_SECTIONS.length - 1].id);
    expect(
      notes[0].compareDocumentPosition(firstSection) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      notes[1].compareDocumentPosition(lastSection) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
  });

  it("renders one info popover per metric doc, with registry content and a section link", () => {
    const sectionNodes = fixture.debugElement.queryAll(By.directive(MethodologySectionComponent));
    expect(sectionNodes.length).toBe(METHODOLOGY_SECTIONS.length);

    for (const node of sectionNodes) {
      const entry = (node.componentInstance as MethodologySectionComponent).section();
      const expectedDocs = METRIC_DOCS.filter((metric) => metric.sectionId === entry.id);
      const popovers = node.queryAll(By.directive(InfoPopover));
      expect(popovers.length, entry.id).toBe(expectedDocs.length);

      expect(
        popovers.map((popover) => (popover.componentInstance as InfoPopover).content()).sort(),
        entry.id,
      ).toEqual(expectedDocs.map((doc) => renderMethodologyCopy(doc.definition)).sort());

      for (const popover of popovers) {
        expect((popover.componentInstance as InfoPopover).link()).toEqual({
          text: "How this is counted",
          routerLink: "/methodology",
          fragment: entry.id,
        });
      }
    }

    expect(root.querySelectorAll("app-info-popover").length).toBe(METRIC_DOCS.length);
  });

  it("never renders a license or attribution literal", () => {
    expect(root.innerHTML).not.toMatch(/CC[- ]?BY|ODbL|OpenStreetMap|data\.gov\.my/i);
  });
});
