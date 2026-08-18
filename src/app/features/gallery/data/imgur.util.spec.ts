import { describe, expect, it } from "vitest";
import { getImgurThumbnail, ImgurThumbSize } from "./imgur.util";

describe("getImgurThumbnail", () => {
  const sizes: ImgurThumbSize[] = ["s", "b", "t", "m", "l", "h"];

  it.each(sizes)("should insert size letter '%s' before file extension", (size) => {
    const url = "https://i.imgur.com/abc1234.jpg";
    const expected = `https://i.imgur.com/abc1234${size}.jpg`;
    expect(getImgurThumbnail(url, size)).toBe(expected);
  });

  it("should handle URLs with different extensions (png, gif, webp, jpeg)", () => {
    expect(getImgurThumbnail("https://i.imgur.com/xyz.png", "m")).toBe(
      "https://i.imgur.com/xyzm.png",
    );
    expect(getImgurThumbnail("https://i.imgur.com/xyz.gif", "t")).toBe(
      "https://i.imgur.com/xyzt.gif",
    );
    expect(getImgurThumbnail("https://i.imgur.com/xyz.webp", "l")).toBe(
      "https://i.imgur.com/xyzl.webp",
    );
    expect(getImgurThumbnail("https://i.imgur.com/xyz.jpeg", "b")).toBe(
      "https://i.imgur.com/xyzb.jpeg",
    );
  });

  it("should insert before the last dot when URL has multiple dots", () => {
    expect(getImgurThumbnail("https://i.imgur.com/sub.domain/image.test.jpg", "s")).toBe(
      "https://i.imgur.com/sub.domain/image.tests.jpg",
    );
  });

  it("should return unchanged string when there is no dot", () => {
    expect(getImgurThumbnail("abc1234", "s")).toBe("abc1234");
    expect(getImgurThumbnail("plainstringnodot", "m")).toBe("plainstringnodot");
  });

  it("should return empty string when input is empty string", () => {
    expect(getImgurThumbnail("", "s")).toBe("");
  });
});
