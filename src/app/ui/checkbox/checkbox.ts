import { BrnCheckbox } from "@spartan-ng/brain/checkbox";
import { Component, computed, effect, forwardRef, input, output } from "@angular/core";
import { NG_VALUE_ACCESSOR, type ControlValueAccessor } from "@angular/forms";
import { hlm } from "../utils/hlm";

/**
 * Works two ways: as a Signal Forms control via `[formField]` (writeValue/registerOnChange,
 * used by the spotting report form), or as a plain checkbox via `[checked]`/`(checkedChange)`
 * property binding (used by the tracker status card, which has no form behind it at all).
 */
@Component({
  selector: "hlm-checkbox",
  imports: [BrnCheckbox],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => HlmCheckbox),
      multi: true,
    },
  ],
  host: { class: "contents" },
  template: `
    <brn-checkbox
      [checked]="checked"
      [disabled]="disabled"
      [class]="_computedClass()"
      (checkedChange)="_handleChange($event)"
      (touched)="onTouched?.()"
    >
      @if (checked) {
        <svg
          viewBox="0 0 24 24"
          class="size-3.5"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
        >
          <path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      }
    </brn-checkbox>
  `,
})
export class HlmCheckbox implements ControlValueAccessor {
  readonly userClass = input<string>("", { alias: "class" });
  readonly checkedInput = input<boolean>(false, { alias: "checked" });
  readonly disabledInput = input<boolean>(false, { alias: "disabled" });
  readonly checkedChange = output<boolean>();

  protected readonly _computedClass = computed(() =>
    hlm(
      "border-input data-checked:bg-primary data-checked:text-primary-foreground data-checked:border-primary focus-visible:border-ring focus-visible:ring-ring/50 flex size-4 shrink-0 items-center justify-center rounded-[4px] border outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50",
      this.userClass(),
    ),
  );

  checked = false;
  disabled = false;

  private onChange?: (value: boolean) => void;
  protected onTouched?: () => void;

  constructor() {
    effect(() => {
      this.checked = this.checkedInput();
    });
    effect(() => {
      this.disabled = this.disabledInput();
    });
  }

  protected _handleChange(value: boolean): void {
    if (this.disabled) return;
    this.checked = value;
    this.onChange?.(value);
    this.onTouched?.();
    this.checkedChange.emit(value);
  }

  writeValue(value: boolean): void {
    this.checked = value;
  }

  registerOnChange(fn: (value: boolean) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }
}
