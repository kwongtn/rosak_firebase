import { BehaviorSubject, combineLatest } from "rxjs";
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

    private async _createImage(arg: Blob | string) {
        const img = document.createElement("img");

        const onLoad = new BehaviorSubject(false);
        const onError = new BehaviorSubject<string | Event>("");

        img.onload = () => onLoad.next(true);
        img.onerror = (e) => onError.next(e);

        if (typeof arg === "string") {
            img.src = arg;
        } else {
            img.src = await this.BlobToDataUrl(arg);
        }

        await combineLatest([onLoad, onError])
            .pipe(
                map((values) => {
                    const [loaded, error] = values;
                    if (error) throw new Error(JSON.stringify(error));

                    return loaded;
                }),
                first((loaded) => !!loaded)
            )
            .toPromise();

        return img;
    }

    private async _imgToCanvas(img: HTMLImageElement) {
        const canvas = document.createElement("canvas");

        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        return canvas;
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
        let ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
        ctx.drawImage(img, 0, 0);

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
        ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
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

        const output = await this.ResizeImage(
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
            return output;
        }

        let top = 100;
        let bottom = 0;

        // eslint-disable-next-line no-constant-condition
        while (true) {
            const i = (top + bottom) / 2;
            console.debug(
                `Compressing image @ ${i}%, top = ${top}, bottom = ${bottom}`
            );

            const output = await this.ResizeImage(
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
                return output;
            }
        }

        throw new Error("Cannot resize image to given parameters");
    }

    async BlobToDataUrl(blob: Blob) {
        return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = reject;
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.readAsDataURL(blob);
        });
    }

    async FileToDataUrl(file: File) {
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

    async GetDimensions(blob: Blob) {
        const img = await this._createImage(blob);
        console.log(img.naturalHeight, img.naturalWidth);
        return {
            height: img.naturalHeight,
            width: img.naturalWidth,
            size: blob.size,
        };
    }
}
