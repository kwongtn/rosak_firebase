import { getThumbnail } from "src/app/@util/imgur";

import { Component, Input } from "@angular/core";

import { data } from "./data";

interface InputImage {
    url: string;
    width: number;
    height: number;
}

interface SectionData {
    id: string;
    totalCount: number;
}

@Component({
    selector: "image-grid",
    templateUrl: "./image-grid.component.html",
    styleUrls: ["./image-grid.component.scss"],
})
export class ImageGridComponent {
    @Input() images: InputImage[] = [];
    @Input() ratioBaseline: number = 200;

}
