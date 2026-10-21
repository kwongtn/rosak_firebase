import { ComponentFixture, TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { MediaYearCount } from "../data/gallery.queries";
import { GalleryYearSliderComponent } from "./gallery-year-slider.component";

describe("GalleryYearSliderComponent", () => {
  let fixture: ComponentFixture<GalleryYearSliderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GalleryYearSliderComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(GalleryYearSliderComponent);
  });

  function render(years: MediaYearCount[]): HTMLElement {
    fixture.componentRef.setInput("years", years);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector("nav")!;
  }

  it("keeps its space but hides the empty nav while the year counts are still loading", () => {
    const nav = render([]);

    // The counts arrive after hydration (browser-only request): a reserved, invisible nav means
    // they appearing neither shifts the layout below nor exposes an empty landmark.
    expect(nav.classList.contains("invisible")).toBe(true);
    expect(nav.classList.contains("min-h-10")).toBe(true);
    expect(nav.classList.contains("sm:min-h-26")).toBe(true);
  });

  it("shows the nav and one button per year once the counts arrive", () => {
    const nav = render([
      { year: 2024, count: 8 },
      { year: 2023, count: 5 },
    ]);

    expect(nav.classList.contains("invisible")).toBe(false);
    const buttons = Array.from(nav.querySelectorAll("button"));
    expect(buttons.map((b) => b.querySelectorAll("span")[0].textContent)).toEqual(["2024", "2023"]);
    expect(buttons.map((b) => b.querySelectorAll("span")[1].textContent)).toEqual(["8", "5"]);
  });

  it("emits the clicked year", () => {
    const nav = render([{ year: 2024, count: 8 }]);
    let emitted: number | undefined;
    fixture.componentInstance.yearSelected.subscribe((year) => (emitted = year));

    nav.querySelector("button")!.click();

    expect(emitted).toBe(2024);
  });
});
