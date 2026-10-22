import { buildSchema } from "graphql";

/**
 * Throws unless `sdl` is a schema with a Query type. export-graphql-schema.mjs runs it before
 * overwriting the committed snapshot, so a stack trace or a stray stdout line from the backend can
 * not replace the snapshot with something documents.spec.ts cannot load.
 */
export function assertSchemaSdl(sdl) {
  let schema;
  try {
    schema = buildSchema(sdl);
  } catch (error) {
    throw new Error(
      `export-graphql-schema: the backend output is not GraphQL SDL (${error.message}):\n${sdl.slice(0, 500)}`,
      { cause: error },
    );
  }
  if (!schema.getQueryType()) {
    throw new Error(
      `export-graphql-schema: no "type Query" in the backend output:\n${sdl.slice(0, 500)}`,
    );
  }
}
