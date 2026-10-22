import { describe, expect, it } from "vitest";

import { badgeVariants } from "./badge";

describe("HlmBadge status variants", () => {
  it.each(["success", "warning", "info"] as const)(
    "%s uses its token tint and no raw palette colour",
    (status) => {
      const classes = badgeVariants({ variant: status });

      expect(classes).toContain(`bg-${status}/15 text-${status}-foreground dark:bg-${status}/20`);
      expect(classes).not.toMatch(/(?:emerald|green|amber|blue|sky)-\d/);
    },
  );
});
