import { BrnButton } from "@spartan-ng/brain/button";
import { Directive, computed, input } from "@angular/core";
import { cva, type VariantProps } from "class-variance-authority";
import { hlm } from "../utils/hlm";

export const buttonVariants = cva(
    "focus-visible:border-ring focus-visible:ring-ring/50 rounded-lg border border-transparent bg-clip-padding text-sm font-medium focus-visible:ring-3 active:not-aria-[haspopup]:translate-y-px inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap transition-all outline-none select-none disabled:pointer-events-none disabled:opacity-50",
    {
        variants: {
            variant: {
                default: "bg-primary text-primary-foreground hover:bg-primary/80",
                outline: "border-border bg-background hover:bg-muted hover:text-foreground",
                secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                ghost: "hover:bg-muted hover:text-foreground",
                destructive: "bg-destructive/10 hover:bg-destructive/20 text-destructive",
                link: "text-primary underline-offset-4 hover:underline",
            },
            size: {
                default: "h-8 px-2.5",
                xs: "h-6 px-2 text-xs",
                sm: "h-7 px-2.5",
                lg: "h-9 px-3",
                icon: "size-8",
                "icon-sm": "size-7",
            },
        },
        defaultVariants: { variant: "default", size: "default" },
    }
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;

@Directive({
    selector: "button[hlmBtn], a[hlmBtn]",
    hostDirectives: [{ directive: BrnButton, inputs: ["disabled"] }],
    host: {
        "data-slot": "button",
        "[class]": "_computedClass()",
    },
})
export class HlmButton {
    readonly variant = input<ButtonVariants["variant"]>("default");
    readonly size = input<ButtonVariants["size"]>("default");
    readonly userClass = input<string>("", { alias: "class" });

    protected readonly _computedClass = computed(() =>
        hlm(buttonVariants({ variant: this.variant(), size: this.size() }), this.userClass())
    );
}
