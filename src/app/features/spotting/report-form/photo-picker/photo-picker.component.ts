import { Component, computed, inject, model, signal } from "@angular/core";
import { HlmButton } from "../../../../ui/button/button";
import { ImageCompressionService } from "../../../../core/upload/image-compression.service";
import { ImageFile } from "../../../../core/upload/image-file";

const MAX_BYTES = 9e6;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/tiff"];

/** Attach-photos widget for the report form, ported from @ui/spotting/form-upload. */
@Component({
  selector: "app-photo-picker",
  imports: [HlmButton],
  template: `
    <input
      #fileInput
      type="file"
      accept="image/*"
      multiple
      class="hidden"
      (change)="_onFilesPicked($event)"
    />
    <div class="flex flex-wrap gap-2">
      @for (image of files(); track image.file.name) {
        <div class="relative size-20 overflow-hidden rounded-lg border">
          @if (image.previewUrl) {
            <img [src]="image.previewUrl" class="size-full object-cover" alt="" />
          }
          <button
            type="button"
            class="bg-background/80 absolute top-0.5 right-0.5 rounded-full p-0.5 text-xs"
            (click)="_remove(image)"
          >
            ✕
          </button>
        </div>
      }
      <button
        hlmBtn
        type="button"
        variant="outline"
        class="size-20 text-2xl"
        (click)="fileInput.click()"
        title="Add photo"
        aria-label="Add photo"
      >
        +
      </button>
    </div>
  `,
})
export class PhotoPickerComponent {
  readonly files = model<ImageFile[]>([]);

  private readonly compression = inject(ImageCompressionService);

  /** How many photos are still being compressed. Callers (report-form, incident-card) check
   * `isCompressing()` before queuing an upload: `_onFilesPicked` only ever updates `files` with
   * a *new* object once compression finishes (line ~72), never mutates the original `entry` in
   * place — a caller that already captured that stale, pre-compression object into the upload
   * queue (by reading `files()` while this was still running) would be holding a reference
   * nothing will ever finish updating, since ImageUploadService's own retry check tests that
   * exact object's `isCompressed` flag, not whatever `files()` says now. */
  private readonly _compressingCount = signal(0);
  readonly isCompressing = computed(() => this._compressingCount() > 0);

  protected async _onFilesPicked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const picked = Array.from(input.files ?? []);
    input.value = "";

    for (const file of picked) {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        continue;
      }
      const entry: ImageFile = {
        file,
        previewUrl: URL.createObjectURL(file),
        toCompress: file.size > MAX_BYTES,
        isCompressed: false,
      };
      this.files.update((list) => [...list, entry]);

      if (entry.toCompress) {
        this._compressingCount.update((n) => n + 1);
        try {
          const compressed = await this.compression.resizeToSize(file, MAX_BYTES);
          this.files.update((list) =>
            list.map((f) => (f === entry ? { ...f, file: compressed, isCompressed: true } : f)),
          );
        } finally {
          this._compressingCount.update((n) => n - 1);
        }
      }
    }
  }

  protected _remove(image: ImageFile): void {
    this.files.update((list) => list.filter((f) => f !== image));
  }
}
