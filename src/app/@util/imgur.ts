type MediaSizes = "s" | "b" | "t" | "m" | "l" | "h";

function getFilename(url: string): string {
    const urlParts = url.split("/");
    const fileName = urlParts[urlParts.length - 1];
    return fileName.split(".")[fileName.split(".").length - 2];
}

/**
 * Get the smaller version of an image on Imgur
 * https://thomas.vanhoutte.be/miniblog/imgur-thumbnail-trick/
 *
 * So if your image URL is https://i.imgur.com/9ZC02Os.jpg,
 * you simply add the l to the image name: https://i.imgur.com/9ZC02Osl.jpg.
 * Now your image is a large thumbnail! (640×640 pixels)
 *
 * Here are all the dimensions and letters to choose from:
 *     s = Small Square (90×90)
 *     b = Big Square (160×160)
 *     t = Small Thumbnail (160×160)
 *     m = Medium Thumbnail (320×320)
 *     l = Large Thumbnail (640×640)
 *     h = Huge Thumbnail (1024×1024)
 */
export function getThumbnail(url: string, size: MediaSizes): string {
    const urlParts = url.split("/");
    const fileName = urlParts[urlParts.length - 1];
    const extension = fileName.split(".")[fileName.split(".").length - 1];
    return `https://i.imgur.com/${getFilename(url)}${size}.${extension}`;
}
