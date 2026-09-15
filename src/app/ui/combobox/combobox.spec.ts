import { provideZonelessChangeDetection } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { ComboboxItem, HlmCombobox } from "./combobox";

describe("HlmCombobox stable track key", () => {
  let fixture: ComponentFixture<HlmCombobox<string>>;
  let component: HlmCombobox<string>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HlmCombobox],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(HlmCombobox<string>);
    component = fixture.componentInstance;
  });

  it("keeps the rendered <li> count in sync with the filtered items", () => {
    const items: ComboboxItem<string>[] = [
      { label: "Apple", value: "a" },
      { label: "Banana", value: "b" },
      { label: "Cherry", value: "c" },
    ];
    component.items.set(items);
    fixture.detectChanges();

    // Open the dropdown (focus triggers the open path) so the option list renders.
    const input = fixture.nativeElement.querySelector("input");
    input.dispatchEvent(new FocusEvent("focus"));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll("li").length).toBe(3);

    input.value = "b";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll("li").length).toBe(1);
  });
});
