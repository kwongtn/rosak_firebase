#!/usr/bin/env node
// Refreshes src/app/core/graphql/schema.graphql from the running backend (`npm run schema:refresh`).
// documents.spec.ts validates every query and mutation string in src/app against this snapshot, so
// the schema contract is checked without a network call. The backend runs in Docker: start it first
// (`docker compose up` in rosak_backend). Override the compose file path with
// ROSAK_BACKEND_COMPOSE when the backend is not at ../rosak_backend (for example in a git worktree).
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertSchemaSdl } from "./graphql-schema-guard.mjs";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const composeFile =
  process.env.ROSAK_BACKEND_COMPOSE ?? join(rootDir, "../rosak_backend/docker-compose.yml");
const printSchema =
  'cd /code && DJANGO_SETTINGS_MODULE=rosak.settings python -c "import django; django.setup(); from rosak.schema import schema; print(schema.as_str())"';

// stdout only: stderr carries a harmless notification line, and execFileSync reports it on failure.
const sdl = execFileSync(
  "docker",
  ["compose", "-f", composeFile, "exec", "-T", "app", "sh", "-c", printSchema],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024 },
);

// Refuse to overwrite the snapshot with anything that is not a schema.
assertSchemaSdl(sdl);

const outPath = join(rootDir, "src/app/core/graphql/schema.graphql");
writeFileSync(outPath, sdl);
console.log(`[export-graphql-schema] ${sdl.split("\n").length - 1} lines -> ${outPath}`);
