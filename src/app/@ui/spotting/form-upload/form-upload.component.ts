import { Message } from "ng-devui";
import { IFileOptions, IUploadOptions, UploadModule } from "ng-devui/upload";
import { NzPopconfirmModule } from "ng-zorro-antd/popconfirm";
import { NzSpinModule } from "ng-zorro-antd/spin";
import {
    ImageCompressionService,
} from "src/app/services/image-compression/image-compression.service";
import { ToastService } from "src/app/services/toast/toast.service";

import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";

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
    file: Blob;
    displayFilename: string = "";

    buffer: string | ArrayBuffer | null = null;

    toCompress: boolean = false;
    isCompressed: boolean = false;

    compressServiceInstance: ImageCompressionService;

    pushToPreview(file: File): void {
        this.compressServiceInstance
            .ResizeImage(file, 300, 300)
            .then((resizedFile: File) => {
                return this.compressServiceInstance.FileBlobToDataUrl(
                    resizedFile
                );
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
                .then((compressedFile: Blob) => {
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
    standalone: true,
    imports: [CommonModule, NzPopconfirmModule, NzSpinModule, UploadModule],
})
export class FormUploadComponent {
    @Input() imageWidth: string = "100px";
    @Input() imageHeight: string = "100px";
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
        accept: VALID_TYPES.join(","),
    };

    constructor(
        private imageCompress: ImageCompressionService,
        private toastService: ToastService
    ) {
        return;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    beforeUpload(file: any) {
        return false;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    alertMsgEvent(messages: Message[]) {
        this.toastService.addMessage(
            `You can only upload images of type ${VALID_TYPES.join(", ")}`,
            "error"
        );
    }

    fileOver(event: boolean) {
        this.isDropOver = event;
    }

    onAddFile(files: File[]) {
        // File array is array of all existing files
        [...Array(files.length).keys()].forEach((fileIndex: number) => {
            const file = files[fileIndex];

            if (!Object.keys(this.files).includes(file.name)) {
                console.log(file);

                const imageFile = new ImageFile(file, this.imageCompress);
                this.files[file.name] = imageFile;
            }
        });

        this.newImageEvent.emit(this.files);
    }

    onImageClick(fileName: string) {
        console.log(`Removing ${fileName} from upload list`);
        delete this.files[fileName];

        this.newImageEvent.emit(this.files);
    }
}
