import { Directive } from "@angular/core";

@Directive({
    selector: "[hlmSkeleton]",
    host: { class: "bg-muted block animate-pulse rounded-md" },
})
export class HlmSkeleton {}
