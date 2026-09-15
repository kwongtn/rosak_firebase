import { Injectable } from "@angular/core";
import { toast, toastState } from "@spartan-ng/brain/sonner";

import { ToastContentComponent, ToastVisualType } from "./toast-content.component";

let toastCounter = 0;

/**
 * Thin app-facing wrapper over @spartan-ng/brain/sonner's `toast` — keeps feature code from
 * importing spartan internals directly, matching the old app's ToastService entry point.
 * Every notification is rendered through ToastContentComponent so the hover pin/x controls
 * (see its doc comment) apply to all toasts, not just ones that opt in.
 */
@Injectable({ providedIn: "root" })
export class ToastService {
  success(title: string, description?: string): void {
    this.show("success", title, description);
  }

  error(title: string, description?: string): void {
    this.show("error", title, description);
  }

  info(title: string, description?: string): void {
    this.show("info", title, description);
  }

  private show(type: ToastVisualType, title: string, description?: string): void {
    const id = `${type}-${toastCounter++}`;
    toastState.create({
      id,
      message: title,
      type,
      description: description ?? "",
      component: ToastContentComponent,
      componentProps: { toastId: id, title, description: description ?? "", type },
    });
  }
}
