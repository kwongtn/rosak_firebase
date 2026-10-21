import { Component, provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ComboboxItem, HlmCombobox } from "./combobox";

const ITEMS: ComboboxItem<string>[] = [
  { label: "Apple", value: "a" },
  { label: "Banana", value: "b" },
  { label: "Cherry", value: "c" },
];

@Component({
  imports: [HlmCombobox],
  template: `
    <hlm-combobox [items]="items" [trailingTemplate]="showTrailing() ? trailingTpl : undefined" />
    <ng-template #trailingTpl>
      <span data-testid="trailing">Trailing</span>
    </ng-template>
  `,
})
class ComboboxHostComponent {
  readonly items = ITEMS;
  readonly showTrailing = signal(true);
}

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

  function listbox(): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[role="listbox"]');
  }

  function status(): string {
    const el = (fixture.nativeElement as HTMLElement).querySelector('[role="status"]');
    return el?.textContent?.trim() ?? "";
  }

  function openList(): void {
    input().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    fixture.detectChanges();
  }

  function type(text: string): void {
    input().value = text;
    input().dispatchEvent(new Event("input", { bubbles: true }));
    fixture.detectChanges();
  }

  function press(key: string): void {
    input().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    fixture.detectChanges();
  }

  /** Records every keydown that makes it up to `document` — where HlmSheet listens for Escape. */
  function watchDocumentKeydown(): { seen: ReturnType<typeof vi.fn>; stop: () => void } {
    const seen = vi.fn();
    document.addEventListener("keydown", seen);
    return { seen, stop: () => document.removeEventListener("keydown", seen) };
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

  it("does not commit a value when Enter is pressed after the field is cleared", () => {
    selectCherryViaEnter();
    expect(component.value()).toBe("c");

    input().value = "";
    input().dispatchEvent(new Event("input", { bubbles: true }));
    fixture.detectChanges();
    expect(component.value()).toBeUndefined();

    // The reported bug: the panel stays open over the now-unfiltered list, and Enter used to
    // silently re-commit `_filtered()[_highlightIndex()]` (a previously highlighted item).
    input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    fixture.detectChanges();

    expect(component.value()).toBeUndefined();
    expect(component.search()).toBe("");
    expect(input().value).toBe("");
  });

  it("does not commit on Enter when the panel was opened with no query or navigation", () => {
    input().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    fixture.detectChanges();
    expect(options().length).toBe(3);

    input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    fixture.detectChanges();

    expect(component.value()).toBeUndefined();
  });

  it("commits the highlighted item after deliberate ArrowDown navigation", () => {
    input().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    fixture.detectChanges();

    input().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    fixture.detectChanges();

    input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    fixture.detectChanges();

    expect(component.value()).toBe("b");
    expect(input().value).toBe("Banana");
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

  it("renders trailing content inside the field and reserves room for it", async () => {
    const hostFixture = TestBed.createComponent(ComboboxHostComponent);
    hostFixture.detectChanges();

    const root = hostFixture.nativeElement as HTMLElement;
    const input = root.querySelector<HTMLInputElement>("hlm-combobox input");
    const trailing = root.querySelector<HTMLElement>('[data-testid="trailing"]');
    if (!input || !trailing) throw new Error("trailing content not rendered");

    expect(trailing.closest("hlm-combobox")).not.toBeNull();
    expect(trailing.parentElement?.classList.contains("pointer-events-none")).toBe(true);
    expect(trailing.parentElement?.classList.contains("right-7")).toBe(true);
    expect(input.classList.contains("pr-36")).toBe(true);

    hostFixture.componentInstance.showTrailing.set(false);
    await hostFixture.whenStable();
    hostFixture.detectChanges();

    expect(root.querySelector('[data-testid="trailing"]')).toBeNull();
    expect(input.classList.contains("pr-6")).toBe(true);
  });

  it("forwards ariaLabel to the input", () => {
    fixture.componentRef.setInput("aria-label", "Line");
    fixture.detectChanges();

    expect(input().getAttribute("aria-label")).toBe("Line");
  });

  describe("ARIA combobox pattern", () => {
    it("declares the combobox role and starts collapsed", () => {
      expect(input().getAttribute("role")).toBe("combobox");
      expect(input().getAttribute("aria-autocomplete")).toBe("list");
      expect(input().getAttribute("aria-expanded")).toBe("false");
      expect(input().getAttribute("aria-controls")).toBeTruthy();
      expect(input().hasAttribute("aria-activedescendant")).toBe(false);
      expect(listbox()).toBeNull();
    });

    it("links the input to the listbox and gives every option a unique id while open", () => {
      openList();

      expect(input().getAttribute("aria-expanded")).toBe("true");
      expect(listbox()?.id).toBe(input().getAttribute("aria-controls"));
      const rows = Array.from(options());
      expect(rows.map((row) => row.getAttribute("role"))).toEqual(["option", "option", "option"]);
      expect(rows.every((row) => row.id !== "")).toBe(true);
      expect(new Set(rows.map((row) => row.id)).size).toBe(3);
    });

    it("names the listbox like the input", () => {
      fixture.componentRef.setInput("aria-label", "Line");
      openList();

      expect(listbox()?.getAttribute("aria-label")).toBe("Line");
    });

    it("tracks the highlighted row in aria-activedescendant and aria-selected", () => {
      openList();
      const rows = Array.from(options());
      expect(input().getAttribute("aria-activedescendant")).toBe(rows[0].id);
      expect(rows.map((row) => row.getAttribute("aria-selected"))).toEqual([
        "true",
        "false",
        "false",
      ]);

      press("ArrowDown");
      expect(input().getAttribute("aria-activedescendant")).toBe(rows[1].id);
      expect(rows.map((row) => row.getAttribute("aria-selected"))).toEqual([
        "false",
        "true",
        "false",
      ]);

      // ArrowUp from the second row, twice, wraps to the last.
      press("ArrowUp");
      press("ArrowUp");
      expect(input().getAttribute("aria-activedescendant")).toBe(rows[2].id);
      expect(rows[2].getAttribute("aria-selected")).toBe("true");
    });

    it("scrolls the highlighted row into view, nearest edge", () => {
      // jsdom does not implement scrollIntoView.
      const scrollIntoView = vi.fn();
      const original = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = scrollIntoView;
      try {
        openList();
        press("ArrowDown");

        expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
        expect(scrollIntoView.mock.contexts.at(-1)).toBe(options()[1]);
      } finally {
        if (original) {
          Element.prototype.scrollIntoView = original;
        } else {
          delete (Element.prototype as Partial<Element>).scrollIntoView;
        }
      }
    });

    it("follows the filtered list and drops to collapsed when nothing matches", () => {
      type("an");
      expect(options().length).toBe(1);
      expect(input().getAttribute("aria-expanded")).toBe("true");
      expect(input().getAttribute("aria-activedescendant")).toBe(options()[0].id);

      type("zzz");
      expect(listbox()).toBeNull();
      expect(input().getAttribute("aria-expanded")).toBe("false");
      expect(input().hasAttribute("aria-activedescendant")).toBe(false);
    });

    it("collapses again once an option is chosen", () => {
      openList();
      options()[1].dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      fixture.detectChanges();

      expect(input().getAttribute("aria-expanded")).toBe("false");
      expect(input().hasAttribute("aria-activedescendant")).toBe(false);
    });

    it("announces how many results the open list has", () => {
      expect(status()).toBe("");

      openList();
      expect(status()).toBe("3 results");

      type("b");
      expect(status()).toBe("1 result");

      press("Escape");
      expect(status()).toBe("");
    });

    it("gives every instance its own listbox id", () => {
      const other = TestBed.createComponent(HlmCombobox<string>);
      other.detectChanges();
      const otherInput = (other.nativeElement as HTMLElement).querySelector("input");

      expect(otherInput?.getAttribute("aria-controls")).toBeTruthy();
      expect(otherInput?.getAttribute("aria-controls")).not.toBe(
        input().getAttribute("aria-controls"),
      );
    });
  });

  describe("Escape", () => {
    it("closes an open list and stops the keypress before it reaches the document", () => {
      const { seen, stop } = watchDocumentKeydown();
      try {
        openList();
        expect(options().length).toBe(3);

        press("Escape");

        expect(options().length).toBe(0);
        expect(seen).not.toHaveBeenCalled();
      } finally {
        stop();
      }
    });

    it("lets Escape through while closed, so a parent sheet can close", () => {
      const { seen, stop } = watchDocumentKeydown();
      try {
        press("Escape");

        expect(seen).toHaveBeenCalledTimes(1);
      } finally {
        stop();
      }
    });

    it("consumes only the first Escape: the second one closes the sheet", () => {
      const { seen, stop } = watchDocumentKeydown();
      try {
        openList();
        press("Escape");
        press("Escape");

        expect(seen).toHaveBeenCalledTimes(1);
      } finally {
        stop();
      }
    });
  });
});
