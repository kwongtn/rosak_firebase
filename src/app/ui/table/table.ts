import { Directive } from "@angular/core";

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

@Directive({
  selector: "tr[hlmTr]",
  host: { class: "hover:bg-muted/50 border-b transition-colors" },
})
export class HlmTr {}

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
