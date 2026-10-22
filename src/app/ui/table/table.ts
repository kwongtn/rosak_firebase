import { Directive, computed, input } from "@angular/core";
import { hlm } from "../utils/hlm";

@Directive({
  selector: "div[hlmTableContainer]",
  host: { class: "relative w-full overflow-x-auto" },
})
export class HlmTableContainer {}

@Directive({ selector: "table[hlmTable]", host: { class: "w-full caption-bottom text-sm" } })
export class HlmTable {}

@Directive({ selector: "thead[hlmTHead]", host: { class: "[&_tr]:border-b" } })
export class HlmTHead {}

@Directive({ selector: "tbody[hlmTBody]", host: { class: "[&_tr:last-child]:border-0" } })
export class HlmTBody {}

// Merges a consumer `class` through `hlm()`: clickable rows ask for `hover:bg-muted`, which lost
// to the host's `hover:bg-muted/50` as a plain class.
@Directive({
  selector: "tr[hlmTr]",
  host: { "[class]": "_computedClass()" },
})
export class HlmTr {
  readonly userClass = input<string>("", { alias: "class" });

  protected readonly _computedClass = computed(() =>
    hlm("hover:bg-muted/50 border-b transition-colors", this.userClass()),
  );
}

@Directive({
  selector: "th[hlmTh]",
  host: {
    class: "text-foreground h-10 px-2 text-start align-middle font-medium whitespace-nowrap",
  },
})
export class HlmTh {}

@Directive({
  selector: "td[hlmTd]",
  host: { class: "p-2 align-middle" },
})
export class HlmTd {}

export const HlmTableImports = [
  HlmTableContainer,
  HlmTable,
  HlmTHead,
  HlmTBody,
  HlmTr,
  HlmTh,
  HlmTd,
] as const;
