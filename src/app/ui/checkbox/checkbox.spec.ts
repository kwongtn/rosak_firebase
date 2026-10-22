import { Component, provideZonelessChangeDetection, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { form as createForm, FormField } from "@angular/forms/signals";
import { beforeEach, describe, expect, it } from "vitest";

import { HlmCheckbox } from "./checkbox";

/** The focusable control `brn-checkbox` renders inside the `display: contents` host. */
function control(fixture: ComponentFixture<unknown>): HTMLButtonElement {
  const el = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
    "button[role='checkbox']",
  );
  if (!el) throw new Error("no inner checkbox control rendered");
  return el;
}

const isChecked = (fixture: ComponentFixture<unknown>): boolean =>
  control(fixture).getAttribute("aria-checked") === "true";

@Component({
  imports: [HlmCheckbox],
  template: `<hlm-checkbox
    [checked]="checked()"
    [disabled]="disabled()"
    (checkedChange)="changes.push($event)"
  />`,
})
class PlainHostComponent {
  readonly checked = signal(false);
  readonly disabled = signal(false);
  readonly changes: boolean[] = [];
}

@Component({
  imports: [HlmCheckbox, ReactiveFormsModule],
  template: `<hlm-checkbox [formControl]="control" />`,
})
class ReactiveHostComponent {
  readonly control = new FormControl(false, { nonNullable: true });
}

@Component({
  imports: [HlmCheckbox, FormField],
  template: `<hlm-checkbox [formField]="agreeForm.agree" />`,
})
class SignalFormHostComponent {
  readonly model = signal({ agree: false });
  protected readonly agreeForm = createForm(this.model);
}

describe("HlmCheckbox", () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  describe("as a plain checkbox ([checked] / (checkedChange))", () => {
    let fixture: ComponentFixture<PlainHostComponent>;

    beforeEach(async () => {
      fixture = TestBed.createComponent(PlainHostComponent);
      await fixture.whenStable();
    });

    it("follows the [checked] input", async () => {
      expect(isChecked(fixture)).toBe(false);

      fixture.componentInstance.checked.set(true);
      await fixture.whenStable();

      expect(isChecked(fixture)).toBe(true);
    });

    it("flips and emits checkedChange when clicked", async () => {
      control(fixture).click();
      await fixture.whenStable();

      expect(fixture.componentInstance.changes).toEqual([true]);
      expect(isChecked(fixture)).toBe(true);
    });

    it("lets a later [checked] value win over an earlier click", async () => {
      control(fixture).click();
      await fixture.whenStable();
      expect(isChecked(fixture)).toBe(true);

      // The input changes true -> false, so the local click state is replaced.
      fixture.componentInstance.checked.set(true);
      await fixture.whenStable();
      fixture.componentInstance.checked.set(false);
      await fixture.whenStable();

      expect(isChecked(fixture)).toBe(false);
    });

    it("follows [disabled]: a disabled control is inert", async () => {
      fixture.componentInstance.disabled.set(true);
      await fixture.whenStable();
      expect(control(fixture).disabled).toBe(true);

      // A natively disabled button dispatches no click, so this proves the attribute, not the
      // `_handleChange` guard (defence in depth for a programmatic checkedChange).
      control(fixture).click();
      await fixture.whenStable();

      expect(fixture.componentInstance.changes).toEqual([]);
      expect(isChecked(fixture)).toBe(false);
    });
  });

  describe("as a reactive-forms control ([formControl])", () => {
    let fixture: ComponentFixture<ReactiveHostComponent>;

    beforeEach(async () => {
      fixture = TestBed.createComponent(ReactiveHostComponent);
      await fixture.whenStable();
    });

    it("shows a programmatic write and a reset without a manual detectChanges", async () => {
      const { control: formControl } = fixture.componentInstance;

      formControl.setValue(true);
      await fixture.whenStable();
      expect(isChecked(fixture)).toBe(true);

      formControl.reset();
      await fixture.whenStable();
      expect(isChecked(fixture)).toBe(false);
    });

    it("writes a click back to the control and marks it touched", async () => {
      control(fixture).click();
      await fixture.whenStable();

      expect(fixture.componentInstance.control.value).toBe(true);
      expect(fixture.componentInstance.control.touched).toBe(true);
    });

    it("applies setDisabledState from control.disable() and enable()", async () => {
      const { control: formControl } = fixture.componentInstance;

      formControl.disable();
      await fixture.whenStable();
      expect(control(fixture).disabled).toBe(true);

      control(fixture).click();
      await fixture.whenStable();
      expect(formControl.value).toBe(false);

      formControl.enable();
      await fixture.whenStable();
      expect(control(fixture).disabled).toBe(false);
    });
  });

  describe("as a Signal Forms control ([formField])", () => {
    let fixture: ComponentFixture<SignalFormHostComponent>;

    beforeEach(async () => {
      fixture = TestBed.createComponent(SignalFormHostComponent);
      await fixture.whenStable();
    });

    it("shows the model value written from outside, as a form reset does", async () => {
      fixture.componentInstance.model.set({ agree: true });
      await fixture.whenStable();
      expect(isChecked(fixture)).toBe(true);

      fixture.componentInstance.model.set({ agree: false });
      await fixture.whenStable();
      expect(isChecked(fixture)).toBe(false);
    });

    it("writes a click into the model", async () => {
      control(fixture).click();
      await fixture.whenStable();

      expect(fixture.componentInstance.model()).toEqual({ agree: true });
    });
  });
});
