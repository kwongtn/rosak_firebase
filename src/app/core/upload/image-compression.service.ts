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

  /** Preserves the original JPEG's EXIF (APP1) segment, since canvas re-encoding drops it. */
  private retrieveExif(blob: Blob): Promise<Blob> {
    const SOS = 0xffda;
    const APP1 = 0xffe1;
    const EXIF = 0x45786966;

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", (ev) => {
        const buffer = ev.target?.result as ArrayBufferLike;
        const view = new DataView(buffer);
        let offset = 0;
        if (view.getUint16(offset) !== 0xffd8) {
          return reject(new Error("not a valid jpeg"));
        }
        offset += 2;

        let marker = view.getUint16(offset);
        while (marker !== SOS) {
          const size = view.getUint16(offset + 2);
          if (marker === APP1 && view.getUint32(offset + 4) === EXIF) {
            return resolve(blob.slice(offset, offset + 2 + size));
          }
          offset += 2 + size;
          marker = view.getUint16(offset);
        }
        return resolve(new Blob());
      });
      reader.readAsArrayBuffer(blob);
    });
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

    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b as Blob), `image/${format}`, quality),
    );
    return new File([blob], file.name, { type: file.type });
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
      }

      if (Math.ceil(top) === Math.ceil(bottom)) {
        return this.copyExif(file, output);
      }
    }
  }
}
