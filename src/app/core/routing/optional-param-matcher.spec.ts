import { UrlSegment } from "@angular/router";
import { describe, expect, it } from "vitest";
import { pathWithOptionalParamMatcher } from "./optional-param-matcher";

describe("pathWithOptionalParamMatcher", () => {
  const matcher = pathWithOptionalParamMatcher("gallery", "mediaId");

  function createSegments(paths: string[]): UrlSegment[] {
    return paths.map((path) => new UrlSegment(path, {}));
  }

  it("should return null for empty segment list", () => {
    const result = matcher([]);
    expect(result).toBeNull();
  });

  it("should return null when prefix does not match", () => {
    const wrongPrefix = createSegments(["articles"]);
    expect(matcher(wrongPrefix)).toBeNull();

    const wrongPrefixWithParam = createSegments(["articles", "123"]);
    expect(matcher(wrongPrefixWithParam)).toBeNull();
  });

  it("should match prefix alone (single segment) with empty posParams", () => {
    const segments = createSegments(["gallery"]);
    const result = matcher(segments);

    expect(result).toEqual({
      consumed: segments,
      posParams: {},
    });
    expect(result).not.toBeNull();
    if (result) {
      expect(result.consumed).toBe(segments);
      expect(result.posParams).toEqual({});
    }
  });

  it("should match prefix with one param (two segments) and bind paramName in posParams", () => {
    const segments = createSegments(["gallery", "photo-42"]);
    const result = matcher(segments);

    expect(result).toEqual({
      consumed: segments,
      posParams: {
        mediaId: segments[1],
      },
    });
    expect(result).not.toBeNull();
    expect(result?.consumed).toBe(segments);
    expect(result?.posParams?.["mediaId"]).toBe(segments[1]);
  });

  it("should return null when there are more than 2 segments", () => {
    const segments = createSegments(["gallery", "photo-42", "extra"]);
    expect(matcher(segments)).toBeNull();

    const manySegments = createSegments(["gallery", "photo-42", "extra", "sub"]);
    expect(matcher(manySegments)).toBeNull();
  });
});
