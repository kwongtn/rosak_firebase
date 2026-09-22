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
