import { faviconHostnameOf } from "./social-link.util";

describe("faviconHostnameOf", () => {
  it("extracts the hostname from a plain https URL", () => {
    expect(faviconHostnameOf("https://example.com")).toBe("example.com");
  });

  it("extracts the hostname from an https URL with a path, query, and fragment", () => {
    expect(faviconHostnameOf("https://sub.example.com/path?q=1#frag")).toBe("sub.example.com");
  });

  it("extracts the hostname from an http URL", () => {
    expect(faviconHostnameOf("http://example.com/path")).toBe("example.com");
  });

  it("drops the port from the hostname", () => {
    expect(faviconHostnameOf("https://example.com:8443/feed")).toBe("example.com");
  });

  it("accepts a single-label hostname without a TLD", () => {
    expect(faviconHostnameOf("https://internal:8443/x")).toBe("internal");
  });

  it("returns null for a URL without a scheme (relative-ish input)", () => {
    expect(faviconHostnameOf("example.com/page")).toBeNull();
  });

  it("returns null for a non-http(s) scheme", () => {
    expect(faviconHostnameOf("mailto:user@example.com")).toBeNull();
    expect(faviconHostnameOf("javascript:alert(1)")).toBeNull();
  });

  it("returns null for unparseable garbage", () => {
    expect(faviconHostnameOf("not a url")).toBeNull();
    expect(faviconHostnameOf("://")).toBeNull();
  });

  it("returns null when the URL is missing or blank", () => {
    expect(faviconHostnameOf(undefined)).toBeNull();
    expect(faviconHostnameOf(null)).toBeNull();
    expect(faviconHostnameOf("")).toBeNull();
  });
});
