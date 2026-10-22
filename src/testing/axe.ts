import type { ComponentFixture } from "@angular/core/testing";
import axe from "axe-core";

/**
 * Structural axe rules only: accessible names, roles, ARIA attributes, form labels, text
 * alternatives and list/heading structure. jsdom has no layout, so color contrast, target size and
 * anything else that measures pixels are left to the browser-based passes (Playwright, Lighthouse).
 */
const STRUCTURAL_TAGS = [
  "cat.aria",
  "cat.name-role-value",
  "cat.text-alternatives",
  "cat.forms",
  "cat.structure",
];

/** One readable line per violating element: `rule-id (impact): help, then the element and its fix`. */
export function formatAxeViolations(violations: axe.Result[]): string[] {
  return violations.flatMap((violation) =>
    violation.nodes.map(
      (node) =>
        `${violation.id} (${violation.impact ?? "unknown"}): ${violation.help}\n` +
        `  ${node.html}\n  ${(node.failureSummary ?? "").replaceAll("\n", "\n  ")}`,
    ),
  );
}

/**
 * Fails when axe finds a structural accessibility violation under the fixture's host element. Await
 * it after the view has settled (`detectChanges`, `whenStable`). axe leaves no listeners or globals
 * behind, so it is safe with `isolate: false`.
 */
export async function expectNoAxeViolations(fixture: ComponentFixture<unknown>): Promise<void> {
  const results = await axe.run(fixture.nativeElement as HTMLElement, {
    runOnly: { type: "tag", values: STRUCTURAL_TAGS },
    resultTypes: ["violations"],
  });
  const violations = formatAxeViolations(results.violations);
  if (violations.length > 0) {
    // Not `expect(...).toEqual([])`: its failure message hides the strings behind "Array(n)".
    throw new Error(`${violations.length} axe violation(s):\n${violations.join("\n")}`);
  }
}
