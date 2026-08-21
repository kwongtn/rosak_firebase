import { afterEach, describe, expect, it, vi } from "vitest";
import { CheerioFetcher, getPageContentFetcher, PuppeteerFetcher } from "./pageContentFetcher";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetchWith(html: string): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(html, { status: 200 })),
  );
}

describe("getPageContentFetcher", () => {
  it("returns a CheerioFetcher by default", () => {
    expect(getPageContentFetcher()).toBeInstanceOf(CheerioFetcher);
  });

  it("returns a PuppeteerFetcher when the puppeteer strategy is selected", () => {
    expect(getPageContentFetcher("puppeteer")).toBeInstanceOf(PuppeteerFetcher);
  });
});

describe("CheerioFetcher.fetch", () => {
  it("rejects with the upstream status when the response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 403 })),
    );

    await expect(new CheerioFetcher().fetch("https://example.com/a")).rejects.toThrow("403");
  });

  it("extracts article text and strips script/style noise", async () => {
    stubFetchWith(`
      <html>
        <body>
          <script>window.tracker = 'x';</script>
          <style>.a { color: red }</style>
          <nav>Menu</nav>
          <article>LRT service disrupted at KL Sentral</article>
          <footer>Copyright</footer>
        </body>
      </html>
    `);

    const content = await new CheerioFetcher().fetch("https://example.com/a");

    expect(content).toContain("LRT service disrupted at KL Sentral");
    expect(content).not.toContain("tracker");
    expect(content).not.toContain("color: red");
    expect(content).not.toContain("Menu");
    expect(content).not.toContain("Copyright");
  });

  it("falls back to body text when no main-content selector matches", async () => {
    stubFetchWith("<html><body><p>Plain page without article tags</p></body></html>");

    const content = await new CheerioFetcher().fetch("https://example.com/b");

    expect(content).toContain("Plain page without article tags");
  });

  it("caps extracted text at 10000 characters", async () => {
    stubFetchWith(`<html><body><article>${"x".repeat(20000)}</article></body></html>`);

    const content = await new CheerioFetcher().fetch("https://example.com/c");

    expect(content.length).toBe(10000);
  });
});

describe("PuppeteerFetcher.fetch", () => {
  it("rejects while the implementation is still a stub", async () => {
    await expect(new PuppeteerFetcher().fetch("https://example.com/d")).rejects.toThrow(
      "not yet implemented",
    );
  });
});
