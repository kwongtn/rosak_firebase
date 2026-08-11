import { isPlatformBrowser } from "@angular/common";
import {
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from "@angular/core";
import { MediaNode } from "../data/gallery.queries";
import { getImgurThumbnail } from "../data/imgur.util";
import { computeJustifiedRows } from "../data/justified-layout.util";

export const TARGET_ROW_HEIGHT = 220;
const GAP = 6;

/**
 * A Flickr-style justified grid: rows of images at a shared height, each keeping its own aspect
 * ratio (no cropping), packed to fill the row's width exactly — see justified-layout.util.ts.
 * Replaces the earlier fixed `aspect-square` grid, which cropped every thumbnail to a square.
 */
@Component({
  selector: "app-justified-grid",
  template: `
    <div #container class="flex flex-col" [style.gap.px]="GAP">
      @for (row of rows(); track $index) {
        <div class="flex" [style.gap.px]="GAP" [style.height.px]="row.height">
          @for (cell of row.cells; track cell.item.id) {
            <button
              type="button"
              class="bg-muted block overflow-hidden rounded-lg"
              [style.width.px]="cell.width"
              (click)="imageClick.emit(cell.item)"
            >
              <img
                [src]="thumbnail(cell.item)"
                loading="lazy"
                alt=""
                class="size-full object-cover"
                (error)="onImageError($event)"
              />
            </button>
          }
        </div>
      }
    </div>
  `,
})
export class JustifiedGridComponent implements OnDestroy {
  readonly items = input.required<MediaNode[]>();
  readonly imageClick = output<MediaNode>();

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly containerRef = viewChild.required<ElementRef<HTMLDivElement>>("container");
  private readonly containerWidth = signal(0);
  private resizeObserver: ResizeObserver | undefined;

  protected readonly GAP = GAP;
  protected readonly rows = computed(() =>
    computeJustifiedRows(this.items(), this.containerWidth(), TARGET_ROW_HEIGHT, GAP),
  );

  constructor() {
    afterNextRender(() => {
      if (!this.isBrowser) {
        return;
      }
      const element = this.containerRef().nativeElement;
      this.containerWidth.set(element.clientWidth);
      this.resizeObserver = new ResizeObserver(([entry]) => {
        this.containerWidth.set(entry.contentRect.width);
      });
      this.resizeObserver.observe(element);
    });
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  protected thumbnail(item: MediaNode): string {
    return item.file ? getImgurThumbnail(item.file.url, "m") : "/image-not-found.png";
  }

  protected onImageError(event: Event): void {
    (event.target as HTMLImageElement).src = "/image-not-found.png";
  }
}
