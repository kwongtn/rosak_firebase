import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Runs axe on the current page and fails on any violation whose rule is not in `known`.
 *
 * `known` is the baseline of defects already reported against the app (the e2e package does not
 * fix app code): it keeps the check green today while any NEW kind of violation fails. Delete a
 * rule from a spec's baseline when its defect is fixed, so it cannot come back unnoticed.
 * `color-contrast` is always off: the checker cannot resolve the theme's oklch() colours.
 * The full violation list is attached to the test for diagnosis.
 */
export async function expectNoNewAxeViolations(
  page: Page,
  where: string,
  known: readonly string[] = [],
): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).disableRules(["color-contrast"]).analyze();
  await test.info().attach(`axe ${where}`, {
    body: JSON.stringify(violations, null, 2),
    contentType: "application/json",
  });
  const unexpected = violations.filter((v) => !known.includes(v.id));
  expect(
    unexpected.map((v) => `${where} ${v.id}: ${v.nodes.map((n) => n.target).join(" | ")}`),
  ).toEqual([]);
}
