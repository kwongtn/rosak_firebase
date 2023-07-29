import { NzImageService } from "ng-zorro-antd/image";

import { Component, Input } from "@angular/core";

export interface InputImage {
    url: string;
    thumbnailUrl: string;
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
    @Input() fillLastRow: boolean = false;

    displayImage: any[] = [];
    loading: boolean = true;

    loadImages: boolean = false;

    constructor(
        private nzImageService: NzImageService
    ) {
        return;
    }

    onViewImage(index: number): void {
        this.nzImageService
            .preview(
                this.images.map((val) => {
                    return { src: val.url };
                })
            )
            .switchTo(index);
    }

    markLoaded(): void {
        this.loading = false;
    }

    onIntersection({ target, visible }: { target: Element; visible: boolean }): void {
        // this.renderer.addClass(target, visible ? 'active' : 'inactive');
        // this.renderer.removeClass(target, visible ? 'inactive' : 'active');
        this.loadImages = visible;
    }
}
