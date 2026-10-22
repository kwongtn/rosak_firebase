import { assertSchemaSdl } from "../../../../scripts/graphql-schema-guard.mjs";

describe("assertSchemaSdl (guard of npm run schema:refresh)", () => {
  it("accepts SDL that has a Query type", () => {
    expect(() => assertSchemaSdl("type Query {\n  ping: String!\n}\n")).not.toThrow();
  });

  it("rejects an empty output", () => {
    expect(() => assertSchemaSdl("")).toThrow(/not GraphQL SDL/);
  });

  it("rejects a stack trace", () => {
    expect(() =>
      assertSchemaSdl('Traceback (most recent call last):\n  File "<string>", line 1'),
    ).toThrow(/not GraphQL SDL/);
  });

  it("rejects a stray notice line in front of valid SDL", () => {
    expect(() =>
      assertSchemaSdl("telegram: notice sent\ntype Query {\n  ping: String!\n}\n"),
    ).toThrow(/not GraphQL SDL/);
  });

  it("rejects SDL without a Query type", () => {
    expect(() => assertSchemaSdl("type Mutation {\n  ping: String!\n}\n")).toThrow(
      /no "type Query"/,
    );
  });
});
