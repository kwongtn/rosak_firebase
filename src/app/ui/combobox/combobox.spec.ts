import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { ComboboxItem, HlmCombobox } from "./combobox";

const ITEMS: ComboboxItem<string>[] = [
  { label: "Apple", value: "a" },
  { label: "Banana", value: "b" },
  { label: "Cherry", value: "c" },
];

describe("HlmCombobox", () => {
  let fixture: ComponentFixture<HlmCombobox<string>>;
  let component: HlmCombobox<string>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HlmCombobox],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(HlmCombobox<string>);
    component = fixture.componentInstance;
    component.items.set(ITEMS);
    fixture.detectChanges();
  });

  function input(): HTMLInputElement {
    const el = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>("input");
    if (!el) throw new Error("combobox input not rendered");
    return el;
  }

  function options(): NodeListOf<HTMLElement> {
    return (fixture.nativeElement as HTMLElement).querySelectorAll("li");
  }

  /** Selects "cher" via Enter and returns with `value()` === "c". */
  function selectCherryViaEnter(): void {
    input().value = "cher";
    input().dispatchEvent(new Event("input", { bubbles: true }));
    fixture.detectChanges();
    input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    fixture.detectChanges();
  }

  /** `_onBlur` defers its sync by 100ms so a (mousedown) selection lands first. */
  async function blurAndSettle(): Promise<void> {
    input().dispatchEvent(new FocusEvent("blur"));
    await new Promise((resolve) => setTimeout(resolve, 150));
    fixture.detectChanges();
  }

  it("keeps the rendered <li> count in sync with the filtered items", () => {
    input().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    fixture.detectChanges();
    expect(options().length).toBe(3);

    input().value = "b";
    input().dispatchEvent(new Event("input", { bubbles: true }));
    fixture.detectChanges();

    expect(options().length).toBe(1);
    expect(options()[0].textContent?.trim()).toBe("Banana");
  });

  it("stays closed when merely focused — the sheet focus trap focuses the first field", () => {
    input().dispatchEvent(new FocusEvent("focus"));
    fixture.detectChanges();

    expect(options().length).toBe(0);
  });

  it("opens on click and closes on Escape", () => {
    input().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    fixture.detectChanges();
    expect(options().length).toBe(3);

    input().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    fixture.detectChanges();
    expect(options().length).toBe(0);
  });

  it("opens and filters when the user types, and Enter selects the highlighted item", () => {
    input().value = "cher";
    input().dispatchEvent(new Event("input", { bubbles: true }));
    fixture.detectChanges();

    expect(options().length).toBe(1);

    input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    fixture.detectChanges();

    expect(component.value()).toBe("c");
    expect(options().length).toBe(0);
  });

  it("opens on ArrowDown when closed and keeps the list open for navigation", () => {
    input().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    fixture.detectChanges();
    expect(options().length).toBe(3);

    input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    fixture.detectChanges();
    expect(component.value()).toBe("a");
  });

  it("clears the value when the user empties the input, and blur cannot resurrect it", async () => {
    selectCherryViaEnter();
    expect(component.value()).toBe("c");

    input().value = "";
    input().dispatchEvent(new Event("input", { bubbles: true }));
    fixture.detectChanges();
    expect(component.value()).toBeUndefined();

    await blurAndSettle();

    // The reported bug: the field used to re-fill "Cherry" and keep "c" selected.
    expect(component.value()).toBeUndefined();
    expect(component.search()).toBe("");
    expect(input().value).toBe("");
  });

  it("treats whitespace-only text as emptying the field", () => {
    selectCherryViaEnter();

    input().value = "   ";
    input().dispatchEvent(new Event("input", { bubbles: true }));
    fixture.detectChanges();

    expect(component.value()).toBeUndefined();
    expect(input().value).toBe("");
  });

  it("keeps the current value while a non-empty query is typed", () => {
    input().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    fixture.detectChanges();
    options()[1].dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    fixture.detectChanges();
    expect(component.value()).toBe("b");
    expect(input().value).toBe("Banana");

    input().value = "che";
    input().dispatchEvent(new Event("input", { bubbles: true }));
    fixture.detectChanges();

    expect(component.value()).toBe("b");
  });

  it("reverts an abandoned, unmatched non-empty query to the selected label on blur", async () => {
    selectCherryViaEnter();

    input().value = "zzz";
    input().dispatchEvent(new Event("input", { bubbles: true }));
    fixture.detectChanges();

    await blurAndSettle();

    expect(component.value()).toBe("c");
    expect(input().value).toBe("Cherry");
  });
});
