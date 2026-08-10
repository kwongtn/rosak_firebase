import { Directive, computed, input } from "@angular/core";
import { hlm } from "../utils/hlm";

/**
 * A native <select>, styled to match hlmInput. Deliberately not a custom listbox: for the
 * small, closed enum choices this app needs (line status, spotting type, wheel status...),
 * a native select is more accessible and more mobile-friendly (opens the OS picker) than a
 * hand-rolled dropdown — spartan-ng's own component set offers the same "native-select" as a
 * supported pattern, not just a shortcut.
 */
@Directive({
    selector: "select[hlmSelect]",
    host: {
        "data-slot": "select",
        "[class]": "_computedClass()",
    },
})
export class HlmNativeSelect {
    readonly userClass = input<string>("", { alias: "class" });

    protected readonly _computedClass = computed(() =>
        hlm(
            // A solid (not transparent) background matters here beyond just the closed select's
            // own look: some browsers base the *dropdown popup's* rendering on the select's
            // resolved background-color, and fall back to a plain light popup when that resolves
            // to transparent — even with `color-scheme: dark` set correctly (see styles.css).
            "border-input focus-visible:border-ring focus-visible:ring-ring/50 bg-background h-8 w-full min-w-0 rounded-lg border px-2.5 py-1 text-sm outline-none transition-colors focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50",
            this.userClass()
        )
    );
}
