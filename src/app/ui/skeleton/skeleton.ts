import { Directive, computed, input } from "@angular/core";
import { hlm } from "../utils/hlm";

// Merges a consumer `class` through `hlm()`: a skeleton is always sized and shaped by its
// consumer (`rounded-full`, `rounded-lg`), which lost to the host's `rounded-md` as a plain class.
@Directive({
  selector: "[hlmSkeleton]",
  host: { "[class]": "_computedClass()" },
})
export class HlmSkeleton {
  readonly userClass = input<string>("", { alias: "class" });

  protected readonly _computedClass = computed(() =>
    hlm("bg-muted block animate-pulse rounded-md", this.userClass()),
  );
}
