import {
  Kind,
  buildSchema,
  isEnumType,
  parse,
  validate,
  type DocumentNode,
  type GraphQLSchema,
} from "graphql";
import { describe, expect, it } from "vitest";
import { stationReportsRequest } from "../../features/station/data/station.queries";

/**
 * The schema contract, checked without a network call: every query and mutation string under
 * `src/app` must validate against `schema.graphql`, the SDL snapshot of the backend. A backend
 * rename or removal otherwise shows up first as a runtime "Cannot query field" error. Refresh the
 * snapshot with `npm run schema:refresh` (needs the backend running in Docker).
 */

/** Node's fs, typed by hand: the runner is Node, but the spec type-check has no Node types. */
const fs = (
  globalThis as unknown as {
    process: { getBuiltinModule(id: "node:fs"): { readFileSync(p: string, enc: "utf8"): string } };
  }
).process.getBuiltinModule("node:fs");

/** Vite's glob import, typed by hand: the spec type-check has no `vite/client` types. */
const documentModules = (
  import.meta as unknown as {
    glob(pattern: string, options: { eager: true }): Record<string, Record<string, unknown>>;
  }
).glob("/src/app/**/*.{queries,mutations}.ts", { eager: true });

/**
 * Documents or unions known to disagree with the schema today: the name the test uses, then the
 * finding that fixes it. The case runs as `it.fails`, so fixing the drift fails it until the entry
 * is removed.
 */
const KNOWN_DRIFT = new Map<string, string>([
  ["SpottingVehicleStatus", "F354: types.ts lists 4 of the schema's 7 values"],
]);

const schema: GraphQLSchema = buildSchema(
  fs.readFileSync("src/app/core/graphql/schema.graphql", "utf8"),
);

// Only strings that start like an operation count; one of those that fails to parse is a failure
// (reported by the test), not a string to skip.
const OPERATION_START = /^\s*(?:query|mutation|subscription)\b/;

interface QueryDocument {
  name: string;
  source: string;
}

const documents: QueryDocument[] = Object.entries(documentModules).flatMap(([path, exports]) =>
  Object.entries(exports)
    .filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" && OPERATION_START.test(entry[1]),
    )
    .map(([exportName, source]) => ({
      name: `${path.replace("/src/app/", "")} ${exportName}`,
      source,
    })),
);

/**
 * `types.ts` unions whose name differs from the schema enum they mirror (their doc comments name it
 * as `spotting.enums.*`). Without the alias the spec would skip them, or compare `WheelStatus` with
 * the unrelated schema enum that merely has the same values today.
 */
const ENUM_ALIAS: Record<string, string> = {
  SpottingType: "SpottingEventType",
  WheelStatus: "SpottingWheelStatus",
};
const enumNameOf = (unionName: string): string => ENUM_ALIAS[unionName] ?? unionName;

function testFor(name: string): typeof it {
  return KNOWN_DRIFT.has(name) ? (it.fails as typeof it) : it;
}

describe("GraphQL documents against schema.graphql", () => {
  it("finds the documents it is meant to validate", () => {
    // A glob that matched nothing would pass every check below.
    expect(documents.length).toBeGreaterThan(50);
  });

  for (const { name, source } of documents) {
    testFor(name)(`${name} is valid`, () => {
      const document: DocumentNode = parse(source);
      expect(document.definitions.some((d) => d.kind === Kind.OPERATION_DEFINITION)).toBe(true);
      expect(validate(schema, document).map((error) => error.message)).toEqual([]);
    });
  }

  it("station.queries stationReportsRequest is valid for several lines", () => {
    // The one document built at runtime (an aliased `lineStatusReports` per line), so no exported
    // string covers it.
    const { query } = stationReportsRequest(["1", "2"]);
    expect(validate(schema, parse(query)).map((error) => error.message)).toEqual([]);
  });
});

describe("string-literal unions in core/graphql/types.ts against schema enums", () => {
  const source = fs.readFileSync("src/app/core/graphql/types.ts", "utf8");
  const unions = new Map<string, string[]>(
    Array.from(
      source.matchAll(/export type (\w+)\s*=\s*((?:\|?\s*"[^"]*"\s*)+);/g),
      ([, name, body]) => [name, Array.from(body.matchAll(/"([^"]*)"/g), (m) => m[1])],
    ),
  );
  const enums = new Map(
    Object.values(schema.getTypeMap())
      .filter(isEnumType)
      .map((type) => [type.name, type.getValues().map((value) => value.name)]),
  );
  const named = [...unions].filter(([name]) => enums.has(enumNameOf(name)));

  it("finds unions named after a schema enum", () => {
    expect(named.length).toBeGreaterThan(3);
  });

  for (const [name, values] of named) {
    testFor(name)(`${name} lists the values of enum ${enumNameOf(name)}`, () => {
      expect([...values].sort()).toEqual([...(enums.get(enumNameOf(name)) ?? [])].sort());
    });
  }
});
