import { BehaviorSubject, combineLatest, firstValueFrom } from "rxjs";
import { first, map } from "rxjs/operators";

import { Injectable } from "@angular/core";

export interface IImageOptions {
    max: number;
}

@Injectable({
    providedIn: "root",
})
export class ImageCompressionService {
    constructor() {
        return;
    }

    retrieveExif(blob: Blob) {
        const SOS = 0xffda;
        const APP1 = 0xffe1;
        const EXIF = 0x45786966;

        return new Promise<Blob>((resolve, reject) => {
            const reader = new FileReader();
            reader.addEventListener("load", (ev: ProgressEvent<FileReader>) => {
                const buffer = ev.target?.result as ArrayBufferLike;
                const view = new DataView(buffer);
                let offset = 0;
                if (view.getUint16(offset) !== 0xffd8)
                    return reject("not a valid jpeg");
                offset += 2;

                let marker = view.getUint16(offset);
                while (marker !== SOS) {
                    const size = view.getUint16(offset + 2);
                    if (marker === APP1 && view.getUint32(offset + 4) === EXIF)
                        return resolve(blob.slice(offset, offset + 2 + size));
                    offset += 2 + size;
                    marker = view.getUint16(offset);
                }
                return resolve(new Blob());
            });
            reader.readAsArrayBuffer(blob);
        });
    }

    async copyExif(src: File, dest: File) {
        const exif = await this.retrieveExif(src);
        return new File([dest.slice(0, 2), exif, dest.slice(2)], src.name, {
            type: "image/jpeg",
        });
    }

    private async _createImage(arg: Blob | string) {
        const img = document.createElement("img");

        const onLoad = new BehaviorSubject(false);
        const onError = new BehaviorSubject<string | Event>("");

        img.onload = () => onLoad.next(true);
        img.onerror = (e) => onError.next(e);

        if (typeof arg === "string") {
            img.src = arg;
        } else {
            img.src = await this.FileBlobToDataUrl(arg);
        }

        await firstValueFrom(
            combineLatest([onLoad, onError]).pipe(
                map((values) => {
                    const [loaded, error] = values;
                    if (error) throw new Error(JSON.stringify(error));

                    return loaded;
                }),
                first((loaded) => !!loaded)
            )
        );

        return img;
    }

    async ResizeImage(
        file: File,
        maxHeight = Infinity,
        maxWidth = Infinity,
        format = "jpeg",
        quality = 0.8
    ) {
        const img = await this._createImage(file);

        const canvas = document.createElement("canvas");

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

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
        ctx.drawImage(img, 0, 0, width, height);

        const result = await new Promise<Blob>((resolve) =>
            canvas.toBlob(resolve as BlobCallback, `image/${format}`, quality)
        );

        return new File([result], file.name, { type: file.type });
    }

    async ResizeToSize(
        file: File,
        max_size: number = 0,
        quality: number = 0.85,
        format: string = "jpeg"
    ) {
        const img = await this._createImage(file);

        let output: File = await this.ResizeImage(
            file,
            img.naturalHeight,
            img.naturalWidth,
            format,
            quality
        );

        if (output.size <= max_size) {
            console.log(
                `Compressed image without resizing from ${file.size / 1e6} to ${
                    output.size / 1e6
                } MB`
            );
            return await this.copyExif(file, output);
        }

        let top = 100;
        let bottom = 0;

        // eslint-disable-next-line no-constant-condition
        while (true) {
            const i = (top + bottom) / 2;
            console.debug(
                `Compressing image @ ${i}%, top = ${top}, bottom = ${bottom}`
            );

            output = await this.ResizeImage(
                file,
                Math.ceil(img.naturalHeight * (i / 100)),
                Math.ceil(img.naturalWidth * (i / 100)),
                format,
                quality
            );

            if (output.size > max_size) {
                top = i;
            } else {
                bottom = i;
            }

            if (Math.ceil(top) === Math.ceil(bottom)) {
                console.log(
                    `Resized image @ ${i}% from ${file.size / 1e6} to ${
                        output.size / 1e6
                    } MB`
                );
                return await this.copyExif(file, output);
            }
        }
    }

    async FileBlobToDataUrl(file: File | Blob) {
        return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = reject;
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.readAsDataURL(file);
        });
    }

    async Base64ToBlob(data: string) {
        const response = await fetch(data);

        return response.blob();
    }

    async Base64ToFile({ data = "", type = "", name = "" }) {
        const blob = await (await fetch(data)).blob();
        return new File([blob], name, { type });
    }
}
