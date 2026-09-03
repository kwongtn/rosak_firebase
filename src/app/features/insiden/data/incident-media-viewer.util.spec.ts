import { describe, expect, it } from "vitest";

import type { CalendarIncidentMedia } from "./insiden.queries";
import { incidentMediaToViewerNode } from "./incident-media-viewer.util";

function makeMedia(overrides: Partial<CalendarIncidentMedia> = {}): CalendarIncidentMedia {
  return {
    id: "media-1",
    file: { url: "https://cdn.example.com/photos/media-1.jpg" },
    width: 1200,
    height: 800,
    uploader: { nickname: "spotter123" },
    ...overrides,
  };
}

describe("incidentMediaToViewerNode", () => {
  it("maps the media to the shape MediaViewerComponent requires (image + uploader)", () => {
    const node = incidentMediaToViewerNode(makeMedia());

    expect(node.id).toBe("media-1");
    expect(node.file).toEqual({ url: "https://cdn.example.com/photos/media-1.jpg" });
    expect(node.width).toBe(1200);
    expect(node.height).toBe(800);
    expect(node.uploader).toEqual({ nickname: "spotter123" });
  });

  it("falls back to an empty nickname for legacy rows without an uploader", () => {
    const node = incidentMediaToViewerNode(makeMedia({ uploader: null }));

    expect(node.uploader).toEqual({ nickname: "" });
  });

  it("leaves createdDate empty because the backend MediaScalar exposes no date field", () => {
    const node = incidentMediaToViewerNode(makeMedia());

    // The gallery's MediaType carries createdDate; the incident medias sub-select
    // (MediaScalar) does not. An empty string is what DatePipe renders as nothing —
    // the viewer's "Uploaded on" block stays blank rather than crashing.
    expect(node.createdDate).toBe("");
  });
});
