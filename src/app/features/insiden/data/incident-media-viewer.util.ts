import type { MediaNode } from "../../gallery/data/gallery.queries";
import type { CalendarIncidentMedia } from "./insiden.queries";

/**
 * Maps an incident's photo (`CalendarIncidentMedia`) to the shape
 * `MediaViewerComponent` (gallery feature) requires, so the card can reuse the
 * gallery's same-page preview instead of opening the raw URL in a new tab.
 *
 * The backend `MediaScalar` (what `CalendarIncidentScalar.medias` returns) has no
 * created-date field — that exists only on the gallery's own `MediaType`, so the
 * viewer's "Uploaded on" row renders empty for incident photos. Everything the
 * viewer can actually show (image + uploader nickname) is passed through.
 */
export function incidentMediaToViewerNode(media: CalendarIncidentMedia): MediaNode {
  return {
    id: media.id,
    // No created-date on the backend `MediaScalar` — DatePipe renders nothing (no crash),
    // the viewer's "Uploaded on" block stays blank for incident photos.
    createdDate: "",
    width: media.width,
    height: media.height,
    file: media.file,
    uploader: { nickname: media.uploader?.nickname ?? "" },
  };
}
