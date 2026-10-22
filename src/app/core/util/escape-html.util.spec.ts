import { escapeHtml } from "./escape-html.util";

describe("escapeHtml", () => {
  it("escapes the five characters that can open markup or end an attribute", () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
    );
  });

  it("escapes an ampersand once, so an existing entity is not left to be decoded", () => {
    expect(escapeHtml("&lt;script&gt;")).toBe("&amp;lt;script&amp;gt;");
  });

  it("returns text with nothing to escape unchanged, including the empty string", () => {
    expect(escapeHtml("Train 12 - KL Sentral")).toBe("Train 12 - KL Sentral");
    expect(escapeHtml("")).toBe("");
  });

  it("never lets a script tag survive when the result is parsed as HTML", () => {
    const host = document.createElement("div");
    host.innerHTML = escapeHtml(`<img src=x onerror="alert(1)"><script>alert(1)</script>`);

    expect(host.children).toHaveLength(0);
    expect(host.textContent).toBe(`<img src=x onerror="alert(1)"><script>alert(1)</script>`);
  });
});
