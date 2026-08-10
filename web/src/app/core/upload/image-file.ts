export interface ImageFile {
    file: File;
    previewUrl?: string;
    /** Set when the file exceeded the size threshold and needs client-side compression first. */
    toCompress: boolean;
    isCompressed: boolean;
}
