import { Directive, computed, input } from "@angular/core";
import { cva, type VariantProps } from "class-variance-authority";
import { hlm } from "../utils/hlm";

export const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        destructive: "bg-destructive/10 text-destructive dark:bg-destructive/20",
        outline: "border-border text-foreground",
        success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
        warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
        info: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
        accent: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
        special: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
        neutral: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export type BadgeVariants = VariantProps<typeof badgeVariants>;

@Directive({
  selector: "[hlmBadge]",
  host: {
    "data-slot": "badge",
    "[class]": "_computedClass()",
  },
})
export class HlmBadge {
  readonly variant = input<BadgeVariants["variant"]>("default");
  readonly userClass = input<string>("", { alias: "class" });

  protected readonly _computedClass = computed(() =>
    hlm(badgeVariants({ variant: this.variant() }), this.userClass()),
  );
}
