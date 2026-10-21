import { formatDate } from "@angular/common";
import { MediaNode } from "./gallery.queries";

/**
 * Accessible name for one gallery photo: the thumbnail button's `aria-label` and the viewer image's
 * `alt`, so a screen reader hears the same words in both places. Built from what the node carries,
 * and either part may be blank (incident photos reuse the viewer and have no created date), so the
 * label degrades to "Photo by X", "Photo, D MMM Y" or just "Photo" instead of printing "undefined".
 */
export function mediaLabel(media: Pick<MediaNode, "createdDate" | "uploader">): string {
  const nickname = media.uploader.nickname;
  const date = media.createdDate ? formatDate(media.createdDate, "d MMM y", "en-US") : "";
  const photo = nickname ? `Photo by ${nickname}` : "Photo";
  return date ? `${photo}, ${date}` : photo;
}
