import { Directive, computed, input } from "@angular/core";
import { hlm } from "../utils/hlm";

// HlmCard and HlmCardContent merge a consumer `class` through `hlm()` (the HlmButton pattern),
// because consumers override their gap and padding (`gap-3 p-4`); as plain host classes the
// larger value won by stylesheet order and the override was dead.
@Directive({
  selector: "[hlmCard]",
  host: { "[class]": "_computedClass()" },
})
export class HlmCard {
  readonly userClass = input<string>("", { alias: "class" });

  protected readonly _computedClass = computed(() =>
    hlm(
      "bg-card text-card-foreground border-border flex flex-col gap-4 rounded-xl border p-5 shadow-sm",
      this.userClass(),
    ),
  );
}

@Directive({
  selector: "[hlmCardHeader]",
  host: { class: "flex flex-col gap-1.5" },
})
export class HlmCardHeader {}

@Directive({
  selector: "[hlmCardTitle]",
  host: { class: "text-sm font-semibold leading-none" },
})
export class HlmCardTitle {}

@Directive({
  selector: "[hlmCardDescription]",
  host: { class: "text-muted-foreground text-sm" },
})
export class HlmCardDescription {}

@Directive({
  selector: "[hlmCardContent]",
  host: { "[class]": "_computedClass()" },
})
export class HlmCardContent {
  readonly userClass = input<string>("", { alias: "class" });

  protected readonly _computedClass = computed(() => hlm("flex flex-col gap-3", this.userClass()));
}

@Directive({
  selector: "[hlmCardFooter]",
  host: { class: "flex items-center gap-2" },
})
export class HlmCardFooter {}

export const HlmCardImports = [
  HlmCard,
  HlmCardHeader,
  HlmCardTitle,
  HlmCardDescription,
  HlmCardContent,
  HlmCardFooter,
] as const;
