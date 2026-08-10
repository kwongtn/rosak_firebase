/**
 * Imgur's own URL-suffix convention for pre-sized thumbnails — ported from the old app's
 * @util/imgur.ts. This is not a backend feature: the GraphQL schema returns exactly one URL per
 * image (see the rewrite notes in docs/frontend-map/gallery.md), and this works purely because
 * Imgur's CDN honors a size-letter inserted before the file extension.
 */
export type ImgurThumbSize = "s" | "b" | "t" | "m" | "l" | "h";

export function getImgurThumbnail(url: string, size: ImgurThumbSize): string {
    const lastDot = url.lastIndexOf(".");
    if (lastDot === -1) {
        return url;
    }
    return `${url.slice(0, lastDot)}${size}${url.slice(lastDot)}`;
}
