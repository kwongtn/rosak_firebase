import { CUSTOM_ELEMENTS_SCHEMA, provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter, Router } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppFooterComponent } from "../../shell/app-footer/app-footer.component";
import { AppNavComponent } from "../../shell/app-nav/app-nav.component";
import { NOT_FOUND_MESSAGES, hashString } from "./not-found-messages";
import { NotFoundPage } from "./not-found.page";

/**
 * Composition test for the 404 page's two-screen layout: the joke fills the first screen, the pet
 * photo sits one screen's worth of scrolling below it, and the footer is pinned to the viewport
 * rather than left two screens down in normal flow — which, on a page this deliberately tall,
 * would amount to never being seen at all.
 */
describe("NotFoundPage", () => {
  let fixture: ComponentFixture<NotFoundPage>;

  /** `Math.random()` decides cat vs dog inside fetchRandomPet — pin it so assertions name one
   * animal instead of racing the coin flip. */
  function stubPetFetch(kind: "cat" | "dog", url: string): void {
    vi.spyOn(Math, "random").mockReturnValue(kind === "cat" ? 0.1 : 0.9);
    const payload = kind === "cat" ? [{ url }] : { message: url };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: () => Promise.resolve(payload) }));
  }

  function flushFetch(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve));
  }

  /** The pet photo is fetched from the constructor, and resolving it takes two microtask hops
   * (fetch → json() → then), which `whenStable()` doesn't drain on its own — flush a macrotask so
   * the whole chain has run before asserting against the block it renders into. */
  async function render(): Promise<HTMLElement> {
    fixture = TestBed.createComponent(NotFoundPage);
    fixture.detectChanges();
    await flushFetch();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function petSectionOf(el: HTMLElement): HTMLElement {
    const petSection = el.querySelector<HTMLElement>('[data-testid="not-found-pet"]');
    if (!petSection) throw new Error("pet section not rendered");
    return petSection;
  }

  beforeEach(async () => {
    // Stubbed before anything renders, so no test can reach the real thecatapi/dog.ceo.
    stubPetFetch("cat", "https://example.test/cat.jpg");
    await TestBed.configureTestingModule({
      imports: [NotFoundPage],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    })
      // The shell (nav/footer) drags in Firestore-shaped deps and a version poll this composition
      // test doesn't care about — drop them and allow the tags as inert elements, the same
      // pattern methodology.page.spec.ts uses.
      .overrideComponent(NotFoundPage, {
        remove: { imports: [AppNavComponent, AppFooterComponent] },
        add: { schemas: [CUSTOM_ELEMENTS_SCHEMA] },
      })
      .compileComponents();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the 404 and the message hashed from the attempted path", async () => {
    const el = await render();

    expect(el.querySelector("h1")?.textContent?.trim()).toBe("404");
    const url = TestBed.inject(Router).url;
    const expected = NOT_FOUND_MESSAGES[hashString(url) % NOT_FOUND_MESSAGES.length];
    expect(el.querySelector("h2")?.textContent?.trim()).toBe(expected.heading);
  });

  it("keeps the pet photo in its own screen-length section, below the 404 block", async () => {
    const el = await render();

    // Two viewport-tall screens, and the photo's own section is the second one — that is the
    // whole "scroll a screen and there's a cat" reveal.
    expect(petSectionOf(el).className).toContain("min-h-dvh");
    expect(el.querySelector("h1")).not.toBeNull();
    expect(petSectionOf(el).querySelector("img")).not.toBeNull();
  });

  it("pins the footer to the viewport instead of leaving it below the second screen", async () => {
    const el = await render();

    const footer = el.querySelector<HTMLElement>('[data-testid="not-found-footer"]');
    if (!footer) throw new Error("footer wrapper not rendered");
    // Regression guard: `fixed` + `bottom-0` *is* the feature. Flow-positioning the footer again
    // would look identical in a shallow render and hide it two screens down on the real page.
    expect(footer.className).toContain("fixed");
    expect(footer.className).toContain("bottom-0");
  });

  it("names the fetched animal in the line above the photo, with no placeholder left", async () => {
    stubPetFetch("dog", "https://example.test/dog.jpg");
    const el = await render();

    const img = petSectionOf(el).querySelector("img");
    expect(img?.getAttribute("src")).toBe("https://example.test/dog.jpg");
    expect(img?.getAttribute("alt")).toBe("A random dog");

    const caption = petSectionOf(el).querySelector("p");
    expect(caption?.textContent).toContain("dog");
    expect(caption?.textContent).not.toContain("{kind}");
  });

  it("shows a skeleton while the photo is still in flight", async () => {
    let settle: (() => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(new Promise((resolve) => (settle = () => resolve(null)))),
    );
    fixture = TestBed.createComponent(NotFoundPage);
    fixture.detectChanges();

    const petSection = petSectionOf(fixture.nativeElement as HTMLElement);
    expect(petSection.querySelector("img")).toBeNull();
    expect(petSection.querySelector("div")).not.toBeNull();

    settle?.();
    await flushFetch();
    fixture.detectChanges();
  });

  it("renders neither skeleton nor broken image when the pet API fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const el = await render();

    const petSection = petSectionOf(el);
    expect(petSection.querySelector("img")).toBeNull();
    expect(petSection.querySelector("div")).toBeNull();
  });
});
