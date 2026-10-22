import { describe, expect, it } from "vitest";

/**
 * Node's fs, typed by hand: the runner is Node, but the spec type-check has no Node types.
 * `process.getBuiltinModule` needs Node 22.3+; `engines` and CI pin 24.
 */
const fs = (
  globalThis as unknown as {
    process: {
      getBuiltinModule(id: "node:fs"): {
        readdirSync(path: string, options: { recursive: true; encoding: "utf8" }): string[];
        readFileSync(path: string, encoding: "utf8"): string;
      };
    };
  }
).process.getBuiltinModule("node:fs");

/**
 * `@angular/build:unit-test` runs Vitest with `isolate: false`, so spec files in one worker share a
 * jsdom window and a module cache and a leak fails only for the files that meet in a worker (see
 * "Unit-test isolation" in docs/COMPONENTS.md). These are the two leaks that broke the suite.
 *
 * - `vi.mock` registrations are per file, the module cache is not: a spec that mocks a module
 *   resets the cache before its imports and after the file.
 * - The test DOM's `URL` has its own `createObjectURL`; once it is deleted, Node's inherited one
 *   throws on a jsdom Blob, and so does every later file that loads `mapbox-gl`.
 *
 * shortcut: regexes over source text, so a leak written another way (an aliased `vi`, a
 * `Object.defineProperty` that is never restored) slips past; extend the rules when one breaks the
 * suite, and chase the rest with a seeded single-worker run.
 */
const MOCKS = /\bvi\.mock\(/;
const RESET_BEFORE = /\bvi\.hoisted\(\s*\(\)\s*=>\s*vi\.resetModules\(\)\s*,?\s*\)/;
const RESET_AFTER = /\bafterAll\(\s*\(\)\s*=>\s*vi\.resetModules\(\)\s*,?\s*\)/;
const DELETES_URL_MEMBER =
  /\bdelete\b[^;\n]*\bURL\b|\bReflect\.deleteProperty\(\s*(?:globalThis\.|window\.)?URL\b/;
const COMMENT = /^\s*(?:\/\/|\/\*|\*)/;

/** The rules a spec's source breaks; a comment line never counts. */
function leaksOf(source: string): string[] {
  const code = source
    .split("\n")
    .filter((line) => !COMMENT.test(line))
    .join("\n");
  const broken: string[] = [];
  if (MOCKS.test(code) && !(RESET_BEFORE.test(code) && RESET_AFTER.test(code))) {
    broken.push(
      "calls vi.mock without vi.hoisted(() => vi.resetModules()) before and afterAll(() => vi.resetModules()) after",
    );
  }
  if (DELETES_URL_MEMBER.test(code)) {
    broken.push("deletes a member of URL: spy on it and restore it instead");
  }
  return broken;
}

describe("test hygiene: spec files share a worker", () => {
  // Paths relative to the project root, where `ng test` runs; this file's own fixtures would match.
  const specs = fs
    .readdirSync("src", { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".spec.ts") && file !== "test-hygiene.spec.ts");

  it("scans the real spec tree", () => {
    // The walk has to see the tree, or the check below passes on an empty list.
    expect(specs.length).toBeGreaterThan(100);
  });

  it("finds no spec that leaks into the next file in its worker", () => {
    const leaks = specs.flatMap((file) =>
      leaksOf(fs.readFileSync(`src/${file}`, "utf8")).map((rule) => `${file} ${rule}`),
    );

    expect(leaks).toEqual([]);
  });

  describe("leaksOf", () => {
    const MOCK = 'vi.mock("x", () => ({}));';
    const BEFORE = "vi.hoisted(() => vi.resetModules());";
    const AFTER = "afterAll(() => vi.resetModules());";

    it.each([
      ["a vi.mock with no reset", MOCK],
      ["a vi.mock with only the reset before it", `${BEFORE}\n${MOCK}`],
      ["a vi.mock with only the reset after the file", `${MOCK}\n${AFTER}`],
      ["a deleted URL.createObjectURL", "delete (URL as unknown as object).createObjectURL;"],
      ["a Reflect.deleteProperty on URL", 'Reflect.deleteProperty(URL, "revokeObjectURL");'],
      [
        "a Reflect.deleteProperty on globalThis.URL",
        'Reflect.deleteProperty(globalThis.URL, "x");',
      ],
    ])("flags %s", (_name, source) => {
      expect(leaksOf(source)).toHaveLength(1);
    });

    it.each([
      ["a vi.mock between the reset pair", `${BEFORE}\n${MOCK}\n${AFTER}`],
      [
        "the pair wrapped over lines",
        `vi.hoisted(() =>\n  vi.resetModules(),\n);\n${MOCK}\nafterAll(\n  () => vi.resetModules(),\n);`,
      ],
      ["a spec with no vi.mock", "vi.spyOn(URL, 'createObjectURL');"],
      ["a vi.mock named in a comment", `// ${MOCK}\n * vi.mock("y") is per file`],
      ["a delete that is not on URL", "delete record.url;"],
    ])("accepts %s", (_name, source) => {
      expect(leaksOf(source)).toEqual([]);
    });
  });
});
