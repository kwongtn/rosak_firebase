import { IFileOptions, IUploadOptions } from "ng-devui/upload";

import { Component } from "@angular/core";

class ImageFile {
    name: string;
    file: File;
    buffer: string | ArrayBuffer | null = null;
    displayFilename: string = "";

    constructor(name: string, file: File) {
        this.name = name;
        this.file = file;

        const reader = new FileReader();
        reader.readAsDataURL(file);

        reader.onload = (event) => {
            if (event.target) {
                this.buffer = event.target.result;
            }
        };

        if (this.name.length > 16) {
            this.displayFilename =
                this.name.substring(0, 16) + "..." + this.name.split(".").pop();
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

    constructor() {
        return;
    }

    beforeUpload(file: any) {
        return false;
    }

    fileOver(event: boolean) {
        this.isDropOver = event;
        console.log(event);
    }

    onAddFile(files: File[]) {
        [...Array(files.length).keys()].forEach((fileIndex: number) => {
            const imageFile = new ImageFile(
                files[fileIndex].name,
                files[fileIndex]
            );
            this.files[files[fileIndex].name] = imageFile;
        });
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
