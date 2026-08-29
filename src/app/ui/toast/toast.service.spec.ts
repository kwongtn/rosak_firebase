import { TestBed } from "@angular/core/testing";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ToastService } from "./toast.service";
import { ToastContentComponent } from "./toast-content.component";
import * as sonner from "@spartan-ng/brain/sonner";

describe("ToastService", () => {
  let service: ToastService;

  // Spy on the real `toastState.create` (a shared singleton object) rather than
  // `vi.mock`-ing the whole module: `ToastService` imports `toastState` as a live
  // binding to this same object, so the spy always intercepts regardless of which
  // test file loaded the module first in a parallel worker. A full `vi.mock` can
  // fail to replace the import in that scenario, leaving the real `create` called.
  beforeEach(() => {
    vi.spyOn(sonner.toastState, "create").mockImplementation(() => "toast-id");
    TestBed.configureTestingModule({});
    service = TestBed.inject(ToastService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function lastCreateCall() {
    const calls = vi.mocked(sonner.toastState.create).mock.calls;
    return calls[calls.length - 1][0] as Record<string, unknown>;
  }

  it("should render success toasts through the custom content component", () => {
    service.success("Success message");
    const data = lastCreateCall();
    expect(data).toMatchObject({
      message: "Success message",
      type: "success",
      component: ToastContentComponent,
    });
    expect(data["componentProps"]).toMatchObject({
      toastId: data["id"],
      title: "Success message",
      type: "success",
    });
  });

  it("should pass the description through as component props", () => {
    service.success("Success message", "Details here");
    const data = lastCreateCall();
    expect(data).toMatchObject({ description: "Details here" });
    expect(data["componentProps"]).toMatchObject({ description: "Details here" });
  });

  it("should render error toasts with the error type", () => {
    service.error("Error message");
    expect(lastCreateCall()).toMatchObject({
      message: "Error message",
      type: "error",
      component: ToastContentComponent,
    });
  });

  it("should render info toasts with the info type", () => {
    service.info("Info message");
    expect(lastCreateCall()).toMatchObject({
      message: "Info message",
      type: "info",
      component: ToastContentComponent,
    });
  });
});
