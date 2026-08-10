import { Injectable } from "@angular/core";
import { toast } from "@spartan-ng/brain/sonner";

/**
 * Thin app-facing wrapper over @spartan-ng/brain/sonner's `toast` — keeps feature code from
 * importing spartan internals directly, matching the old app's ToastService entry point.
 */
@Injectable({ providedIn: "root" })
export class ToastService {
    success(title: string, description?: string): void {
        toast.success(title, description ? { description } : undefined);
    }

    error(title: string, description?: string): void {
        toast.error(title, description ? { description } : undefined);
    }

    info(title: string, description?: string): void {
        toast.info(title, description ? { description } : undefined);
    }
}
