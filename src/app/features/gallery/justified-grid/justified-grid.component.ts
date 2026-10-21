import { Component, computed, input, output } from "@angular/core";
import { MediaNode } from "../data/gallery.queries";
import { getImgurThumbnail } from "../data/imgur.util";
import { mediaLabel } from "../data/media-label.util";

export const TARGET_ROW_HEIGHT = 220;
const GAP = 6;
/** Shape assumed for a photo that carries no usable width/height: a plain 4:3. */
const FALLBACK_ASPECT = 4 / 3;

/**
 * A Flickr-style justified grid in CSS alone, so the server renders exactly what the client does:
 * no measured width, and no photo waits for hydration. One `flex-wrap` container; each tile's
 * `flex-basis` is its aspect ratio times the target row height and its `flex-grow` is proportional
 * to the aspect ratio, so the browser fits as many tiles per row as the width allows and then
 * stretches that row to the full width at one shared height, every photo keeping its own shape.
 * A `padding-bottom` of 100 / aspect % reserves each tile's height before its image arrives. A
 * trailing spacer with a huge `flex-grow` takes the last, incomplete row's free space, so that row
 * stays at the target height instead of being blown up.
 */
@Component({
  selector: "app-justified-grid",
  template: `
    <div class="flex flex-wrap" [style.gap.px]="GAP">
      @for (tile of tiles(); track tile.item.id; let i = $index) {
        <div
          class="relative"
          [style.flex-grow]="tile.aspect * 100"
          [style.flex-basis.px]="tile.aspect * TARGET_ROW_HEIGHT"
        >
          <div [style.padding-bottom.%]="100 / tile.aspect"></div>
          <button
            type="button"
            class="bg-muted absolute inset-0 block overflow-hidden rounded-lg"
            [attr.aria-label]="tile.label"
            (click)="imageClick.emit(tile.item)"
          >
            <img
              [src]="thumbnail(tile.item)"
              [attr.loading]="i < eagerCount() ? 'eager' : 'lazy'"
              [attr.fetchpriority]="i === 0 && eagerCount() > 0 ? 'high' : null"
              alt=""
              class="size-full object-cover"
              (error)="onImageError($event)"
            />
          </button>
        </div>
      }
      <div class="grow-[1000000]"></div>
    </div>
  `,
})
export class JustifiedGridComponent {
  readonly items = input.required<MediaNode[]>();
  /** How many of the first photos load eagerly (the very first also with high fetch priority) —
   * pass it only to the grid holding the page's top photos, which are LCP candidates; every other
   * photo stays lazy. */
  readonly eagerCount = input(0);
  readonly imageClick = output<MediaNode>();

  protected readonly GAP = GAP;
  protected readonly TARGET_ROW_HEIGHT = TARGET_ROW_HEIGHT;
  protected readonly tiles = computed(() =>
    this.items().map((item) => ({
      item,
      aspect: item.width > 0 && item.height > 0 ? item.width / item.height : FALLBACK_ASPECT,
      label: mediaLabel(item),
    })),
  );

  protected thumbnail(item: MediaNode): string {
    return item.file ? getImgurThumbnail(item.file.url, "m") : "/image-not-found.png";
  }

  protected onImageError(event: Event): void {
    (event.target as HTMLImageElement).src = "/image-not-found.png";
  }
}
