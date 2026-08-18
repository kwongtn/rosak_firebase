import { TestBed } from "@angular/core/testing";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ToastService } from "./toast.service";
import * as sonner from "@spartan-ng/brain/sonner";

vi.mock("@spartan-ng/brain/sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe("ToastService", () => {
  let service: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ToastService);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should call sonner toast.success with title only", () => {
    service.success("Success message");
    expect(sonner.toast.success).toHaveBeenCalledWith("Success message", undefined);
  });

  it("should call sonner toast.success with title and description", () => {
    service.success("Success message", "Details here");
    expect(sonner.toast.success).toHaveBeenCalledWith("Success message", {
      description: "Details here",
    });
  });

  it("should call sonner toast.error with title only", () => {
    service.error("Error message");
    expect(sonner.toast.error).toHaveBeenCalledWith("Error message", undefined);
  });

  it("should call sonner toast.error with title and description", () => {
    service.error("Error message", "Error details");
    expect(sonner.toast.error).toHaveBeenCalledWith("Error message", {
      description: "Error details",
    });
  });

  it("should call sonner toast.info with title only", () => {
    service.info("Info message");
    expect(sonner.toast.info).toHaveBeenCalledWith("Info message", undefined);
  });

  it("should call sonner toast.info with title and description", () => {
    service.info("Info message", "Info details");
    expect(sonner.toast.info).toHaveBeenCalledWith("Info message", { description: "Info details" });
  });
});
