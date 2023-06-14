import { IFileOptions, IUploadOptions } from "ng-devui/upload";
import {
    ImageCompressionService,
} from "src/app/services/image-compression/image-compression.service";
import { ToastService } from "src/app/services/toast/toast.service";

import { Component, EventEmitter, Output } from "@angular/core";

const MAX_MEGABYTE = 9e6;

const VALID_TYPES: string[] = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/tiff",
    // Future support
    // "video/mp4",
    // "video/x-msvideo",
    // "video/webm",
    // "video/x-msvideo",
    // quicktime, x-ms-wmv, x-matroska, x-flv
];

export class ImageFile {
    name: string;
    file: File;
    displayFilename: string = "";

    buffer: string | ArrayBuffer | null = null;

    toCompress: boolean = false;
    isCompressed: boolean = false;

    compressServiceInstance: ImageCompressionService;

    pushToPreview(file: File): void {
        this.compressServiceInstance
            .ResizeImage(file, 300, 300)
            .then((resizedFile: File) => {
                return this.compressServiceInstance.FileToDataUrl(resizedFile);
            })
            .then((dataUrl: string) => {
                this.buffer = dataUrl;
            });
    }

    constructor(file: File, compressServiceInstance: ImageCompressionService) {
        this.file = file;
        this.name = file.name;
        this.compressServiceInstance = compressServiceInstance;

        this.pushToPreview(file);

        if (file.size > MAX_MEGABYTE) {
            this.toCompress = true;
            compressServiceInstance
                .ResizeToSize(file, MAX_MEGABYTE)
                .then((compressedFile: File) => {
                    this.file = compressedFile;
                    this.isCompressed = true;
                });
        }

        if (this.name.length > 16) {
            this.displayFilename =
                this.name.substring(0, 12) +
                "\n" +
                this.name.substring(12, 16) +
                "..." +
                this.name.split(".").pop();
        } else {
            this.displayFilename = this.name;
        }
    }
}

@Component({
    selector: "spotting-form-upload",
    templateUrl: "./form-upload.component.html",
    styleUrls: ["./form-upload.component.scss"],
})
export class FormUploadComponent {
    @Output() newImageEvent = new EventEmitter<{ [key: string]: ImageFile }>();

    files: { [key: string]: ImageFile } = {};
    isDropOver = false;
    uploadOptions: IUploadOptions = {
        uri: "/upload",
        maximumSize: undefined,
        checkSameName: true,
    };
    fileOptions: IFileOptions = {
        multiple: true,
    };

    constructor(
        private imageCompress: ImageCompressionService,
        private toastService: ToastService
    ) {
        return;
    }

    beforeUpload(file: any) {
        return false;
    }

    fileOver(event: boolean) {
        this.isDropOver = event;
    }

    onAddFile(files: File[]) {
        [...Array(files.length).keys()].forEach((fileIndex: number) => {
            const file = files[fileIndex];
            if (!VALID_TYPES.includes(file.type)) {
                this.toastService.addMessage(
                    `You can only upload images of type ${VALID_TYPES.join(
                        ", "
                    )}`,
                    "error"
                );
                return;
            }

            console.log(file);

            const imageFile = new ImageFile(file, this.imageCompress);
            this.files[file.name] = imageFile;
        });

        this.newImageEvent.emit(this.files);
    }

    onImageClick(fileName: string) {
        console.log(fileName);
        delete this.files[fileName];
    }

    // alertMsg(event: any[]) {
    //     this.message = event;
    // }
    // deleteFile(currFile: any) {
    //     this.fileUploaders = this.fileUploaders.filter((fileUploader) => {
    //         return currFile !== fileUploader;
    //     });
    // }
}
