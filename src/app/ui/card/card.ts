import { Directive } from "@angular/core";

@Directive({
  selector: "[hlmCard]",
  host: {
    class:
      "bg-card text-card-foreground border-border flex flex-col gap-4 rounded-xl border p-5 shadow-sm",
  },
})
export class HlmCard {}

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
  host: { class: "flex flex-col gap-3" },
})
export class HlmCardContent {}

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
