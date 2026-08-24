import { isChunkLoadError } from "./chunk-load-error.util";

describe("isChunkLoadError", () => {
  describe("chunk-load failures (true)", () => {
    it("matches Chrome's 'Failed to fetch dynamically imported module'", () => {
      expect(
        isChunkLoadError(
          "TypeError: Failed to fetch dynamically imported module: https://rosak.web.app/chunk-D4-DL31Z2.js",
        ),
      ).toBe(true);
    });

    it("matches Safari's 'Importing a module script failed'", () => {
      expect(isChunkLoadError("Importing a module script failed.")).toBe(true);
    });

    it("matches Firefox's 'Error loading dynamically imported module' regardless of case", () => {
      expect(isChunkLoadError("error loading dynamically imported module")).toBe(true);
    });

    it("matches webpack-style 'Loading chunk … failed' errors", () => {
      expect(isChunkLoadError("ChunkLoadError: Loading chunk 12 failed")).toBe(true);
    });

    it("matches a bare hashed-chunk URL (resource error events carry only the script src)", () => {
      expect(isChunkLoadError("https://rosak.web.app/chunk-D4-DL31Z2.js")).toBe(true);
      expect(isChunkLoadError("https://rosak.web.app/main-ABC123.js?v=1")).toBe(true);
    });
  });

  describe("non-chunk errors (false)", () => {
    it("does not match ordinary runtime TypeErrors", () => {
      expect(isChunkLoadError("Cannot read properties of undefined (reading 'id')")).toBe(false);
      expect(isChunkLoadError("TypeError: x is not a function")).toBe(false);
    });

    it("does not match unrelated HTTP failures", () => {
      expect(isChunkLoadError("HttpErrorResponse: 500 Internal Server Error")).toBe(false);
    });

    it("returns false for empty input", () => {
      expect(isChunkLoadError("")).toBe(false);
    });
  });
});
