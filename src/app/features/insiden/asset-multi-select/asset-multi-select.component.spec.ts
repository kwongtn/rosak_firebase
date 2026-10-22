import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { AssetMultiSelectComponent, parentCodeChipText } from "./asset-multi-select.component";

describe("parentCodeChipText", () => {
  it("shows the last dash-separated segment of a line code", () => {
    expect(parentCodeChipText("KTMK-PKL")).toBe("PKL");
  });

  it("shows the last space-separated segment of a line code", () => {
    expect(parentCodeChipText("KTM ETS")).toBe("ETS");
  });

  it("keeps a code without separators as-is", () => {
    expect(parentCodeChipText("KJL")).toBe("KJL");
  });

  it("handles ragged separators and empty input", () => {
    expect(parentCodeChipText("--KTM--ETS--")).toBe("ETS");
    expect(parentCodeChipText("")).toBe("");
  });
});

describe("AssetMultiSelectComponent fillHeight", () => {
  let fixture: ComponentFixture<AssetMultiSelectComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AssetMultiSelectComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(AssetMultiSelectComponent);
    fixture.componentRef.setInput("heading", "Stations affected");
    fixture.componentRef.setInput("options", [
      { id: "s1", label: "KL Sentral" },
      { id: "s2", label: "Subang Jaya" },
    ]);
    fixture.componentRef.setInput("selectedIds", []);
    fixture.componentRef.setInput("fillHeight", false);
    fixture.detectChanges();
  });

  function root(): HTMLElement {
    const el = (fixture.nativeElement as HTMLElement).firstElementChild;
    if (!el) throw new Error("root not rendered");
    return el as HTMLElement;
  }

  function list(): HTMLElement {
    const el = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '[data-testid="asset-option-list"]',
    );
    if (!el) throw new Error("option list not rendered");
    return el;
  }

  it("caps the option list at max-h-44 by default", () => {
    expect(list().classList.contains("max-h-44")).toBe(true);
    expect(list().classList.contains("max-h-none")).toBe(false);
    expect(list().classList.contains("flex-1")).toBe(false);
    expect(root().classList.contains("flex-1")).toBe(false);
    expect((fixture.nativeElement as HTMLElement).classList.contains("flex-col")).toBe(false);
  });

  it("makes the option list fill the remaining height when fillHeight is true", () => {
    fixture.componentRef.setInput("fillHeight", true);
    fixture.detectChanges();

    expect(list().classList.contains("max-h-44")).toBe(false);
    expect(list().classList.contains("max-h-none")).toBe(true);
    expect(list().classList.contains("flex-1")).toBe(true);
    expect(list().classList.contains("min-h-0")).toBe(true);
    // Still its own scroll container, so the sheet body never has to scroll.
    expect(list().classList.contains("overflow-y-auto")).toBe(true);
    // The host itself becomes the flex column the root grows into — a `h-full` on the root
    // would resolve to auto here (cyclic percentage) and let the list overflow the host.
    const host = fixture.nativeElement as HTMLElement;
    expect(host.classList.contains("flex")).toBe(true);
    expect(host.classList.contains("flex-col")).toBe(true);
    expect(host.classList.contains("min-h-0")).toBe(true);
    expect(root().classList.contains("flex-1")).toBe(true);
    expect(root().classList.contains("min-h-0")).toBe(true);
  });
});

describe("AssetMultiSelectComponent behaviour", () => {
  let fixture: ComponentFixture<AssetMultiSelectComponent>;

  // M101 runs on two lines; the codes are matched as typed, the labels are what the rider sees.
  const OPTIONS = [
    { id: "v1", label: "C243", parentCodes: ["KJL"] },
    { id: "v2", label: "M101", parentCodes: ["AGL", "SPL"] },
    { id: "v3", label: "C244", parentCodes: ["KJL"] },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AssetMultiSelectComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(AssetMultiSelectComponent);
    fixture.componentRef.setInput("heading", "Vehicles");
    fixture.componentRef.setInput("options", OPTIONS);
    fixture.componentRef.setInput("selectedIds", []);
    fixture.detectChanges();
  });

  const host = () => fixture.nativeElement as HTMLElement;

  function labels(): string[] {
    return Array.from(host().querySelectorAll('[data-testid="asset-option-list"] label')).map(
      (label) => label.querySelector("span")?.textContent?.trim() ?? "",
    );
  }

  function search(text: string): void {
    const input = host().querySelector<HTMLInputElement>('input[type="text"]');
    if (!input) throw new Error("search box not rendered");
    input.value = text;
    input.dispatchEvent(new Event("input"));
    fixture.detectChanges();
  }

  function tick(label: string): void {
    const row = Array.from(host().querySelectorAll('[data-testid="asset-option-list"] label')).find(
      (element) => element.querySelector("span")?.textContent?.trim() === label,
    );
    const checkbox = row?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (!checkbox) throw new Error(`${label} not listed`);
    checkbox.click();
    fixture.detectChanges();
  }

  it("finds an option by any of its parent line codes as well as by its label", () => {
    search("spl");
    expect(labels()).toEqual(["M101"]);

    search("KJL");
    expect(labels()).toEqual(["C243", "C244"]);

    search("c24");
    expect(labels()).toEqual(["C243", "C244"]);
  });

  it("says nothing matched rather than showing the empty-list message", () => {
    search("  zzz ");

    expect(labels()).toEqual([]);
    expect(host().textContent).toContain('No matches for "zzz".');
  });

  it("keeps the given order unless pinnedSelected floats the ticked options to the top", () => {
    fixture.componentRef.setInput("selectedIds", ["v3", "v2"]);
    fixture.detectChanges();
    expect(labels()).toEqual(["C243", "M101", "C244"]);

    fixture.componentRef.setInput("pinnedSelected", true);
    fixture.detectChanges();
    // Ticked first, each group in the given order (not in the order they were ticked).
    expect(labels()).toEqual(["M101", "C244", "C243"]);
  });

  it("emits the new selection on every toggle, appending a tick and dropping an untick", () => {
    const emitted: string[][] = [];
    fixture.componentInstance.selectedIds.subscribe((ids) => emitted.push(ids));

    tick("C244");
    tick("M101");
    tick("C244");

    expect(emitted).toEqual([["v3"], ["v3", "v2"], ["v2"]]);
    expect(fixture.componentInstance.selectedIds()).toEqual(["v2"]);
  });
});
