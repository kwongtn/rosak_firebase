import { Directive, ElementRef, OnInit, computed, inject, input, isDevMode } from "@angular/core";
import { hlm } from "../utils/hlm";

/**
 * The square, round, icon-only button used for sheet "Close" buttons and the nav's icon row: a
 * `size-8` hit area, a centred icon, a hover tint and a visible keyboard focus ring. `size-8` and
 * the rest are defaults a consumer `class` overrides through `hlm()` (`class="size-7 -mr-1.5"`).
 * Always `type="button"`, so one inside a `<form>` never submits it.
 *
 * It has no text, so it needs an accessible name from `aria-label` or `aria-labelledby`; in dev
 * mode a missing one logs a warning. Use `HlmButton` (`hlmBtn size="icon"`) for a bordered or
 * filled icon button; this one is the bare ghost form.
 */
@Directive({
  selector: "button[hlmIconBtn]",
  host: {
    "data-slot": "icon-button",
    type: "button",
    "[class]": "_computedClass()",
  },
})
export class HlmIconButton implements OnInit {
  readonly userClass = input<string>("", { alias: "class" });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected readonly _computedClass = computed(() =>
    hlm(
      "text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring/50 inline-flex size-8 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-3",
      this.userClass(),
    ),
  );

  // Host bindings (`[attr.aria-label]`) are applied before ngOnInit, so a bound name counts.
  ngOnInit(): void {
    if (
      isDevMode() &&
      !this.host.hasAttribute("aria-label") &&
      !this.host.hasAttribute("aria-labelledby")
    ) {
      console.warn(
        "hlmIconBtn has no accessible name: add aria-label or aria-labelledby.",
        this.host,
      );
    }
  }
}
