import { describe, expect, it } from "vitest";
import { mediaLabel } from "./media-label.util";

describe("mediaLabel", () => {
  it("names the uploader and the upload date", () => {
    expect(mediaLabel({ createdDate: "2024-05-12", uploader: { nickname: "spotter123" } })).toBe(
      "Photo by spotter123, 12 May 2024",
    );
  });

  it("leaves the uploader out when the nickname is blank", () => {
    expect(mediaLabel({ createdDate: "2024-05-12", uploader: { nickname: "" } })).toBe(
      "Photo, 12 May 2024",
    );
  });

  it("leaves the uploader out when the backend hides it (null)", () => {
    expect(mediaLabel({ createdDate: "2024-05-12", uploader: null })).toBe("Photo, 12 May 2024");
  });

  it("leaves the date out when there is none, as for incident photos", () => {
    expect(mediaLabel({ createdDate: "", uploader: { nickname: "spotter123" } })).toBe(
      "Photo by spotter123",
    );
  });

  it("is just 'Photo' when it has neither", () => {
    expect(mediaLabel({ createdDate: "", uploader: { nickname: "" } })).toBe("Photo");
  });
});
