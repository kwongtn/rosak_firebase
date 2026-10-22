import { Injectable } from "@angular/core";

/**
 * Client-side image resize/compression, ported from
 * src/app/services/image-compression.service.ts. Used to shrink spotting-report
 * photos over MAX_MEGABYTE before upload (see ImageUploadService).
 */
@Injectable({ providedIn: "root" })
export class ImageCompressionService {
  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e);
      img.src = src;
    });
  }

  /** Preserves the original JPEG's EXIF (APP1) segment, since canvas re-encoding drops it. Its GPS
   * is removed later, when ImageUploadService sends the file (see stripGps). The Orientation tag is
   * reset to 1: drawing the image on a canvas already applied it to the pixels, so keeping it would
   * rotate the photo a second time in a viewer that reads EXIF. Resolves to an empty Blob when
   * there is no usable segment (a PNG, or a JPEG with none or cut short) and never waits on bytes
   * that are not there. */
  private async retrieveExif(blob: Blob): Promise<Blob> {
    const SOI = 0xffd8;
    const SOS = 0xffda;
    const APP1 = 0xffe1;
    const EXIF = 0x45786966;

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(bytes.buffer);
    if (view.byteLength < 4 || view.getUint16(0) !== SOI) {
      return new Blob();
    }
    let offset = 2;
    // Each marker is read only while its 4 bytes (marker and length) are there.
    while (offset + 4 <= view.byteLength) {
      const marker = view.getUint16(offset);
      if (marker === SOS || marker >> 8 !== 0xff) {
        break;
      }
      const end = offset + 2 + view.getUint16(offset + 2);
      if (marker === APP1 && offset + 8 <= view.byteLength && view.getUint32(offset + 4) === EXIF) {
        if (end > view.byteLength) {
          break;
        }
        const segment = bytes.slice(offset, end);
        this.resetOrientation(segment);
        return new Blob([segment]);
      }
      offset = end;
    }
    return new Blob();
  }

  /** Sets IFD0's Orientation entry (tag 0x0112) of an APP1 segment to 1, in place. */
  private resetOrientation(segment: Uint8Array): void {
    const TIFF = 10; // marker (2) + length (2) + "Exif\0\0" (6)
    const view = new DataView(segment.buffer);
    if (view.byteLength < TIFF + 8) {
      return;
    }
    const little = view.getUint16(TIFF) === 0x4949; // "II"; "MM" is big-endian
    const ifd = TIFF + view.getUint32(TIFF + 4, little);
    if (ifd + 2 > view.byteLength) {
      return;
    }
    for (let i = 0, count = view.getUint16(ifd, little); i < count; i++) {
      const entry = ifd + 2 + i * 12;
      if (entry + 12 > view.byteLength) {
        return;
      }
      if (view.getUint16(entry, little) === 0x0112) {
        view.setUint16(entry + 8, 1, little);
        return;
      }
    }
  }

  private async copyExif(src: File, dest: File): Promise<File> {
    const exif = await this.retrieveExif(src);
    return new File([dest.slice(0, 2), exif, dest.slice(2)], src.name, {
      type: "image/jpeg",
    });
  }

  private async fileToDataUrl(file: File | Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.readAsDataURL(file);
    });
  }

  async resizeImage(
    file: File,
    maxHeight = Infinity,
    maxWidth = Infinity,
    format = "jpeg",
    quality = 0.8,
  ): Promise<File> {
    const img = await this.loadImage(await this.fileToDataUrl(file));

    let width = img.naturalWidth;
    let height = img.naturalHeight;
    if (width > maxWidth) {
      height *= maxWidth / width;
      width = maxWidth;
    }
    if (height > maxHeight) {
      width *= maxHeight / height;
      height = maxHeight;
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, `image/${format}`, quality),
    );
    if (!blob) {
      // The browser gives up on an image it cannot allocate (a huge canvas, low memory).
      throw new Error("The browser could not re-encode the image");
    }
    // The bytes are what the canvas encoded, whatever the source was: a PNG in becomes a JPEG out.
    return new File([blob], file.name, { type: blob.type });
  }

  /** Binary-searches a resize factor until the file lands at/under maxSizeBytes. */
  async resizeToSize(
    file: File,
    maxSizeBytes: number,
    quality = 0.85,
    format = "jpeg",
  ): Promise<File> {
    const img = await this.loadImage(await this.fileToDataUrl(file));

    let output = await this.resizeImage(file, img.naturalHeight, img.naturalWidth, format, quality);
    if (output.size <= maxSizeBytes) {
      return this.copyExif(file, output);
    }

    let top = 100;
    let bottom = 0;
    let fitting: File | undefined;

    while (true) {
      const pct = (top + bottom) / 2;
      output = await this.resizeImage(
        file,
        Math.ceil(img.naturalHeight * (pct / 100)),
        Math.ceil(img.naturalWidth * (pct / 100)),
        format,
        quality,
      );

      if (output.size > maxSizeBytes) {
        top = pct;
      } else {
        bottom = pct;
        fitting = output;
      }

      if (Math.ceil(top) === Math.ceil(bottom)) {
        // The last step can be one that was still too big: hand back the last one that fit.
        return this.copyExif(file, fitting ?? output);
      }
    }
  }
}
