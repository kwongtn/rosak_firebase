import { NzImageService } from "ng-zorro-antd/image";

import {
    AfterViewInit,
    Component,
    ElementRef,
    EventEmitter,
    Input,
    OnInit,
    Output,
    ViewChild,
} from "@angular/core";

export interface InputImage {
    src: string;
    width: number;
    height: number;
    display: boolean;
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
export class ImageGridComponent implements OnInit, AfterViewInit {
    @Input() images: InputImage[] = [];
    @Input() ratioBaseline: number = 200;
    @Input() fillLastRow: boolean = true;

    @ViewChild("gridContainer") gridContainer!: ElementRef;

    @Output() onComponentDimensionChange: EventEmitter<[number, number]> =
        new EventEmitter<[number, number]>();

    displayImage: { [key: string]: boolean } = {};
    loading: boolean = true;

    constructor(private nzImageService: NzImageService) {
        return;
    }

    ngAfterViewInit() {
        this.onComponentDimensionChange.emit([
            this.gridContainer.nativeElement.offsetWidth,
            this.gridContainer.nativeElement.offsetHeight,
        ]);
    }

    getUrl(index: number): string {
        const img = this.images[index];
        const width = Math.round((img.width * this.ratioBaseline) * 1.1 / img.height);

        // Use the height:width ratio to calculate the new height of the image.
        const height = Math.round(img.height * width / img.width);
        const params = `&width=${width}&height=${height}`;

        return `https://media.discordapp.net/attachments/${img.src}?format=webp&quality=lossless${params}`;
    };


    onViewImage(index: number): void {
        this.nzImageService
            .preview(
                this.images.map((val) => {
                    return {
                        src: `https://cdn.discordapp.com/attachments/${val.src}`
                    };
                })
            )
            .switchTo(index);
    }

    markLoaded(): void {
        this.loading = false;
    }

    onIntersection({
        target,
        visible,
    }: {
        target: Element;
        visible: boolean;
    }): void {
        this.displayImage[target.id] = visible;
    }

    ngOnInit(): void {
        return;
    }
}
