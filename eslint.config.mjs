import angular from "angular-eslint";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

// Report-first config (F206): every rule starts at "warn" and moves to "error" once it reports
// zero warnings (only alt-text so far). The rule set is deliberately small: the repo's `any` ban,
// the template accessibility rules from MISTAKES.md, and unawaited promises. Covers src/** only:
// e2e/ and functions/ have no tsconfig for typed linting.
export default defineConfig(
  { ignores: ["dist", ".angular", "node_modules", "graphify-out", "functions/lib"] },
  {
    files: ["src/**/*.ts"],
    // Lints the `template:` literals of components with the template rules below.
    processor: angular.processInlineTemplates,
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-floating-promises": "warn",
    },
  },
  {
    // `src/index.html` is the static shell, not an Angular template.
    files: ["src/**/*.html"], // also matches the virtual files of inline templates
    ignores: ["src/index.html"],
    languageOptions: { parser: angular.templateParser },
    plugins: { "@angular-eslint/template": angular.templatePlugin },
    rules: {
      "@angular-eslint/template/alt-text": "error",
      "@angular-eslint/template/click-events-have-key-events": "warn",
      "@angular-eslint/template/interactive-supports-focus": "warn",
      "@angular-eslint/template/label-has-associated-control": "warn",
    },
  },
);
