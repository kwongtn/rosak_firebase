import { describe, expect, it } from "vitest";
import { LineStatus } from "../../core/graphql/types";
import {
  NOT_FOUND_MESSAGES,
  NOT_FOUND_SCROLL_LINES,
  hashString,
  scrollLineFor,
} from "./not-found-messages";

describe("hashString", () => {
  it("is deterministic", () => {
    expect(hashString("/definitely-not-a-line")).toBe(hashString("/definitely-not-a-line"));
  });

  it("returns a non-negative integer", () => {
    for (const path of ["/", "/a", "/some/dead/route?x=1", ""]) {
      const hash = hashString(path);
      expect(Number.isInteger(hash)).toBe(true);
      expect(hash).toBeGreaterThanOrEqual(0);
    }
  });

  it("separates similar paths, so neighbouring dead links don't share a joke", () => {
    // A weak hash here would collapse these into the same bucket and show the same punchline for
    // the whole family of mistyped URLs — the exact thing the pool exists to avoid.
    const hashes = ["/tracker", "/tracker2", "/tracker3", "/trackerx"].map(hashString);
    expect(new Set(hashes).size).toBeGreaterThan(1);
  });
});

describe("NOT_FOUND_MESSAGES", () => {
  const statuses: LineStatus[] = ["DEFUNCT", "TOTAL_DISRUPTION", "PARTIAL_DISRUPTION", "TESTING"];

  it("has a non-trivial pool, so the same punchline isn't seen twice in a row", () => {
    expect(NOT_FOUND_MESSAGES.length).toBeGreaterThanOrEqual(20);
  });

  it("every entry is fully written and carries a real LineStatus", () => {
    for (const message of NOT_FOUND_MESSAGES) {
      expect(message.eyebrow.length).toBeGreaterThan(0);
      expect(message.heading.length).toBeGreaterThan(0);
      expect(message.body.length).toBeGreaterThan(0);
      expect(statuses).toContain(message.status);
    }
  });

  it("spreads one URL family across the pool rather than pinning it to one message", () => {
    const headings = new Set(
      Array.from(
        { length: 40 },
        (_, i) => NOT_FOUND_MESSAGES[hashString(`/dead-${i}`) % NOT_FOUND_MESSAGES.length].heading,
      ),
    );
    expect(headings.size).toBeGreaterThan(1);
  });
});

describe("scrollLineFor", () => {
  const paths = ["/tracker", "/gallery", "/nope", "/spotting/missing", "/oops"];

  it("picks the same line for the same dead URL, on every render", () => {
    for (const path of paths) {
      expect(scrollLineFor(path, "cat")).toBe(scrollLineFor(path, "cat"));
      expect(scrollLineFor(path, "dog")).toBe(scrollLineFor(path, "dog"));
    }
  });

  it("always names the animal and never leaks the {kind} placeholder", () => {
    for (const path of paths) {
      for (const kind of ["cat", "dog"]) {
        const line = scrollLineFor(path, kind);
        expect(line).not.toContain("{kind}");
        expect(line).toContain(kind);
        expect(line.length).toBeGreaterThan(0);
      }
    }
  });

  it("names the animal that was actually fetched, not a fixed one", () => {
    for (const path of paths) {
      expect(scrollLineFor(path, "cat")).toBe(scrollLineFor(path, "dog").replaceAll("dog", "cat"));
    }
  });

  it("varies across dead URLs instead of showing the same line every time", () => {
    const picked = new Set(paths.map((path) => scrollLineFor(path, "cat")));
    expect(picked.size).toBeGreaterThan(1);
  });

  it("only ever returns a line from the pool, and every line in it is reachable", () => {
    // The pool holds the `{kind}` template; scrollLineFor returns it filled in, so compare against
    // the same substitution the picker does rather than the raw templates.
    const renderedPool = NOT_FOUND_SCROLL_LINES.map((raw) => raw.replaceAll("{kind}", "cat"));
    const picked = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const line = scrollLineFor(`/dead-link-${i}`, "cat");
      expect(renderedPool).toContain(line);
      picked.add(line);
    }
    // A pool entry no hash bucket can reach is dead copy nobody will ever read.
    expect(picked.size).toBe(NOT_FOUND_SCROLL_LINES.length);
  });
});
