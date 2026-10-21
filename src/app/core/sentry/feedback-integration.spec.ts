import { describe, expect, it, vi } from "vitest";

import { createFeedback } from "./feedback-integration";

const feedbackIntegration = vi.hoisted(() => vi.fn());
vi.mock("@sentry/feedback?lazy", () => ({
  buildFeedbackIntegration: () => feedbackIntegration,
  feedbackModalIntegration: {},
  feedbackScreenshotIntegration: {},
}));

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
