import { afterEach, describe, expect, it, vi } from "vitest";

import type { ToastService } from "../../ui/toast/toast.service";
import { toastSubmitFailure } from "./submit-failure";

describe("toastSubmitFailure", () => {
  const error = vi.fn();
  const toast = { error } as unknown as ToastService;

  afterEach(() => {
    error.mockClear();
    vi.restoreAllMocks();
  });

  it("asks the rider to check their connection and try again", () => {
    toastSubmitFailure(toast);

    expect(error).toHaveBeenCalledExactlyOnceWith(
      "Couldn't submit",
      "Check your connection and try again.",
    );
  });

  it("says the draft is kept when the browser is offline", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

    toastSubmitFailure(toast);

    expect(error).toHaveBeenCalledExactlyOnceWith(
      "Couldn't submit",
      "You're offline. Your draft is kept; try again when you're back online.",
    );
  });
});
