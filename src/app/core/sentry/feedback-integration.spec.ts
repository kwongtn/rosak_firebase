import { afterAll, describe, expect, it, vi } from "vitest";

import { createFeedback } from "./feedback-integration";

// The unit-test builder shares one module cache across spec files (`isolate: false`), so reset it on
// both sides of this file; see "Unit-test isolation" in docs/COMPONENTS.md.
vi.hoisted(() => vi.resetModules());

const feedbackIntegration = vi.hoisted(() => vi.fn());
vi.mock("@sentry/feedback?lazy", () => ({
  buildFeedbackIntegration: () => feedbackIntegration,
  feedbackModalIntegration: {},
  feedbackScreenshotIntegration: {},
}));

afterAll(() => vi.resetModules());

describe("feedback-integration: createFeedback", () => {
  it("builds the widget without Sentry's own floating button", () => {
    const widget = { name: "Feedback" };
    feedbackIntegration.mockReturnValue(widget);

    expect(createFeedback()).toBe(widget);

    expect(feedbackIntegration).toHaveBeenCalledExactlyOnceWith({
      autoInject: false,
      colorScheme: "system",
    });
  });
});
