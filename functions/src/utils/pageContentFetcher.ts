/**
 * Strategy-pattern page content fetchers for AI incident extraction.
 *
 * - CheerioFetcher: static HTML fetch + tag cleaning. Fast and cheap; the MVP default.
 * - PuppeteerFetcher: reserved for JS-rendered pages (not yet implemented).
 *
 * Switch at runtime via the FETCHER_STRATEGY environment variable.
 */

/** Maximum characters of extracted text sent to Gemini (token-cost guard). */
const MAX_CONTENT_CHARS = 10_000;

/** Fetch timeout — leaves headroom inside the function's 20s budget. */
const FETCH_TIMEOUT_MS = 10_000;

/** Selectors tried in order for the article body; first non-empty match wins. */
const MAIN_CONTENT_SELECTORS = ["article", "main", ".content", ".post-content"] as const;

export interface PageContentFetcher {
  /** Fetches `url` and returns cleaned, size-capped plain text. */
  fetch(url: string): Promise<string>;
}

export class CheerioFetcher implements PageContentFetcher {
  async fetch(url: string): Promise<string> {
    const cheerio = await import("cheerio");

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RosakBot/1.0)",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Strip noise that would dilute the extraction prompt.
    $("script, style, nav, footer, .ad, .advertisement").remove();

    let mainContent = "";
    for (const selector of MAIN_CONTENT_SELECTORS) {
      const candidate = $(selector).text().trim();
      if (candidate.length > 0) {
        mainContent = candidate;
        break;
      }
    }
    if (mainContent.length === 0) {
      mainContent = $("body").text();
    }

    return mainContent.trim().slice(0, MAX_CONTENT_CHARS);
  }
}

export class PuppeteerFetcher implements PageContentFetcher {
  async fetch(_url: string): Promise<string> {
    // Future implementation for JS-rendered pages:
    // const puppeteer = await import("puppeteer");
    // const browser = await puppeteer.launch({ headless: true });
    // try {
    //   const page = await browser.newPage();
    //   await page.goto(_url, { waitUntil: "networkidle0" });
    //   const content = await page.evaluate(() => document.body.innerText);
    //   return content.slice(0, MAX_CONTENT_CHARS);
    // } finally {
    //   await browser.close();
    // }

    throw new Error("Puppeteer fetcher not yet implemented");
  }
}

export type FetcherStrategy = "cheerio" | "puppeteer";

/** Factory: pick a fetcher by strategy name (default: cheerio). */
export function getPageContentFetcher(strategy: FetcherStrategy = "cheerio"): PageContentFetcher {
  switch (strategy) {
    case "cheerio":
      return new CheerioFetcher();
    case "puppeteer":
      return new PuppeteerFetcher();
    default: {
      const unreachable: never = strategy;
      throw new Error(`Unknown fetcher strategy: ${String(unreachable)}`);
    }
  }
}
