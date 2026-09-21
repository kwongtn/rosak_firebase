import { describe, expect, it } from "vitest";

import { feedDomainOf } from "./feed-link.util";

describe("feedDomainOf", () => {
  it("returns the hostname with a leading www. stripped", () => {
    expect(feedDomainOf("https://www.example.com/story")).toBe("example.com");
  });

  it("keeps subdomains and bare hosts intact", () => {
    expect(feedDomainOf("https://news.bbc.co.uk/article")).toBe("news.bbc.co.uk");
    expect(feedDomainOf("https://x.com/prasarana/status/1")).toBe("x.com");
  });

  it("falls back to the raw url when no hostname can be extracted", () => {
    expect(feedDomainOf("not a url")).toBe("not a url");
    expect(feedDomainOf("mailto:someone@example.com")).toBe("mailto:someone@example.com");
    expect(feedDomainOf("")).toBe("");
  });
});
