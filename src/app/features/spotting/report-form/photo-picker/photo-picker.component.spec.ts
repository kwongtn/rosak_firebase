import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ImageCompressionService } from "../../../../core/upload/image-compression.service";
import { PhotoPickerComponent } from "./photo-picker.component";

const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d];
const GIF = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00];
const TIFF_LITTLE_ENDIAN = [0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
const TIFF_BIG_ENDIAN = [0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00];
// An HEIC starts with an ftyp box whose brand is "heic".
const HEIC = [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63];
// A WebP starts "RIFF", four size bytes, then "WEBP".
const WEBP = [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50];
const TEXT = [0x68, 0x69];

function photo(name: string, type: string, bytes: number[]): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("PhotoPickerComponent", () => {
  let component: PhotoPickerComponent;
  let createObjectURL: MockInstance<typeof URL.createObjectURL>;
  let resizeToSize: ReturnType<typeof vi.fn>;

  /** Runs the picker's change handler on these files, as the browser does after a file dialog. */
  function pick(...files: File[]): Promise<void> {
    const input = { files, value: "picked" } as unknown as HTMLInputElement;
    return (component as unknown as { _onFilesPicked(event: Event): Promise<void> })._onFilesPicked(
      { target: input } as unknown as Event,
    );
  }

  beforeEach(() => {
    // The picker only needs a string for each preview. Spied and restored, never deleted: later spec
    // files in this worker share this `URL` (see "Unit-test isolation" in docs/COMPONENTS.md).
    createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
    resizeToSize = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: ImageCompressionService, useValue: { resizeToSize } },
      ],
    });
    component = TestBed.createComponent(PhotoPickerComponent).componentInstance;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["JPEG", "photo.jpg", "image/jpeg", JPEG],
    ["PNG", "photo.png", "image/png", PNG],
    ["GIF", "photo.gif", "image/gif", GIF],
    ["little-endian TIFF", "scan.tif", "image/tiff", TIFF_LITTLE_ENDIAN],
    ["big-endian TIFF", "scan.tif", "image/tiff", TIFF_BIG_ENDIAN],
    ["HEIC", "IMG_0001.heic", "image/heic", HEIC],
    ["HEIC renamed to .jpg", "IMG_0002.jpg", "image/jpeg", HEIC],
    ["HEIC with no MIME type", "IMG_0003.heic", "", HEIC],
    ["WebP", "card.webp", "image/webp", WEBP],
  ])("keeps a %s", async (_label, name, type, bytes) => {
    await pick(photo(name, type, bytes));

    expect(component.files().map((image) => image.file.name)).toEqual([name]);
  });

  it("skips a file that is not an image", async () => {
    await pick(photo("notes.txt", "text/plain", TEXT));

    expect(component.files()).toEqual([]);
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("uploads the original as it is when a big photo cannot be compressed", async () => {
    resizeToSize.mockRejectedValue(new Event("error"));
    const big = new File([new Uint8Array(9_000_001)], "IMG_0004.heic", { type: "image/heic" });

    await pick(big);

    expect(resizeToSize).toHaveBeenCalledOnce();
    expect(component.files()).toEqual([
      { file: big, previewUrl: "blob:preview", toCompress: false, isCompressed: false },
    ]);
    expect(component.isCompressing()).toBe(false);
  });
});
