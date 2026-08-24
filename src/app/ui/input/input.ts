import { Directive, ElementRef, computed, inject, input } from "@angular/core";
import { hlm } from "../utils/hlm";

@Directive({
  selector: "input[hlmInput], textarea[hlmInput]",
  host: {
    "data-slot": "input",
    "[class]": "_computedClass()",
    "[attr.aria-invalid]": "_errorState() || null",
  },
})
export class HlmInput {
  readonly invalid = input(false);
  /** Set by the signal-forms FormField directive alongside `invalid`; `aria-invalid`
   * (and the destructive border/ring it triggers) is only applied once the field has
   * actually been interacted with. */
  readonly touched = input(false);
  readonly userClass = input<string>("", { alias: "class" });

  private readonly _elementRef = inject(ElementRef<HTMLInputElement | HTMLTextAreaElement>);

  protected readonly _errorState = computed(() => this.invalid() && this.touched());

  protected readonly _computedClass = computed(() =>
    hlm(
      "border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 w-full min-w-0 rounded-lg border bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:ring-3 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 placeholder:text-muted-foreground",
      // A fixed h-8 would squash textareas to a single line regardless of their `rows`
      // attribute; textareas size naturally from `rows` with a min-h-8 floor instead.
      this._elementRef.nativeElement.tagName === "TEXTAREA" ? "min-h-8" : "h-8",
      this.userClass(),
    ),
  );
}
