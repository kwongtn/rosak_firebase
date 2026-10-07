import { ActivatedRoute, Router } from "@angular/router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  parseEnumQueryParam,
  parseTextQueryParam,
  queryParamForWrite,
  readEnumQueryParam,
  readTextQueryParam,
  writeQueryParams,
} from "./query-param.util";

const VIEWS = ["rider", "pro"] as const;
type View = (typeof VIEWS)[number];

/** Minimal `ParamMap` stand-in — the read helpers only ever call `get`. */
function params(values: Record<string, string>) {
  return { get: (name: string): string | null => values[name] ?? null };
}

describe("query-param.util: parseEnumQueryParam", () => {
  it("accepts a value that is exactly one of the allowed ones", () => {
    expect(parseEnumQueryParam("pro", VIEWS, "rider")).toBe("pro");
  });

  it("trims surrounding whitespace, because a hand-edited URL carries it", () => {
    expect(parseEnumQueryParam("  pro  ", VIEWS, "rider")).toBe("pro");
  });

  it("falls back for anything else rather than coercing it", () => {
    // A URL is user input. `PRO` is not "pro", and `?view=` is not "rider" — both must degrade to
    // the fallback instead of being normalised into a value the UI never offered.
    expect(parseEnumQueryParam("PRO", VIEWS, "rider")).toBe("rider");
    expect(parseEnumQueryParam("", VIEWS, "rider")).toBe("rider");
    expect(parseEnumQueryParam("poweruser", VIEWS, "rider")).toBe("rider");
    expect(parseEnumQueryParam(null, VIEWS, "rider")).toBe("rider");
    expect(parseEnumQueryParam(undefined, VIEWS, "rider")).toBe("rider");
  });

  it("treats the fallback itself as a legal value", () => {
    expect(parseEnumQueryParam("rider", VIEWS, "rider")).toBe("rider");
  });
});

describe("query-param.util: parseTextQueryParam", () => {
  it("returns a trimmed non-empty string", () => {
    expect(parseTextQueryParam("  rapid kl  ")).toBe("rapid kl");
  });

  it("collapses absent and blank to one null state", () => {
    // This is what lets the write side DROP the key for an emptied search box instead of writing
    // `?q=` — otherwise "no query" and "an empty query" would be two states to keep in sync.
    expect(parseTextQueryParam("")).toBeNull();
    expect(parseTextQueryParam("   ")).toBeNull();
    expect(parseTextQueryParam(null)).toBeNull();
    expect(parseTextQueryParam(undefined)).toBeNull();
  });
});

describe("query-param.util: queryParamForWrite", () => {
  it("returns null for a default value so the key is removed from the URL", () => {
    expect(queryParamForWrite("rider", "rider")).toBeNull();
  });

  it("returns the value when it differs from the default", () => {
    expect(queryParamForWrite("pro", "rider")).toBe("pro");
  });
});

describe("query-param.util: read helpers", () => {
  it("reads an enum param off a ParamMap-shaped object", () => {
    expect(readEnumQueryParam(params({ view: "pro" }), "view", VIEWS, "rider")).toBe("pro");
    expect(readEnumQueryParam(params({}), "view", VIEWS, "rider")).toBe("rider");
  });

  it("reads a text param, collapsing blank to null", () => {
    expect(readTextQueryParam(params({ q: "kl" }), "q")).toBe("kl");
    expect(readTextQueryParam(params({ q: "  " }), "q")).toBeNull();
    expect(readTextQueryParam(params({}), "q")).toBeNull();
  });

  it("tolerates a missing param map entirely", () => {
    expect(readEnumQueryParam(null, "view", VIEWS, "rider")).toBe("rider");
    expect(readEnumQueryParam(undefined, "view", VIEWS, "rider")).toBe("rider");
    expect(readTextQueryParam(null, "q")).toBeNull();
  });

  it("narrows to the caller's union, not to string", () => {
    const view: View = readEnumQueryParam(params({ view: "pro" }), "view", VIEWS, "rider");
    expect(view).toBe("pro");
  });
});

describe("query-param.util: writeQueryParams", () => {
  let navigate: ReturnType<typeof vi.fn>;
  let router: Router;
  let route: ActivatedRoute;

  beforeEach(() => {
    navigate = vi.fn().mockResolvedValue(true);
    router = { navigate } as unknown as Router;
    route = {} as ActivatedRoute;
  });

  it("merges the patch and replaces the history entry", () => {
    writeQueryParams(router, route, { view: "pro", sort: null }, true);

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith([], {
      relativeTo: route,
      queryParams: { view: "pro", sort: null },
      // A view toggle is not a navigation a reader wants to walk back through one step at a time,
      // and merging keeps a sibling surface's param (a `?line=`) intact.
      queryParamsHandling: "merge",
      replaceUrl: true,
    });
  });

  it("is a no-op on the server", () => {
    // A reactive navigate() during SSR hangs the render: the server waits on a navigation the
    // client will never answer. That is why the guard is here rather than left to the caller.
    writeQueryParams(router, route, { view: "pro" }, false);
    expect(navigate).not.toHaveBeenCalled();
  });
});
