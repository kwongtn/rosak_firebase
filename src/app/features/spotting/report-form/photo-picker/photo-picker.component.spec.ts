import { provideZonelessChangeDetection } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ImageCompressionService } from "../../../../core/upload/image-compression.service";
import { PhotoPickerComponent } from "./photo-picker.component";

const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d];
const GIF = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00];
const TIFF_LITTLE_ENDIAN = [0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
const TIFF_BIG_ENDIAN = [0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00];
// An HEIC starts with an ftyp box whose brand is "heic": no accepted format begins that way.
const HEIC = [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63];
// A WebP starts "RIFF", four size bytes, then "WEBP".
const WEBP = [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50];
const TEXT = [0x68, 0x69];

function photo(name: string, type: string, bytes: number[]): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("PhotoPickerComponent", () => {
  let component: PhotoPickerComponent;
  let createObjectURL: ReturnType<typeof vi.fn>;

  /** Runs the picker's change handler on these files, as the browser does after a file dialog. */
  function pick(...files: File[]): Promise<void> {
    const input = { files, value: "picked" } as unknown as HTMLInputElement;
    return (component as unknown as { _onFilesPicked(event: Event): Promise<void> })._onFilesPicked(
      { target: input } as unknown as Event,
    );
  }

  beforeEach(() => {
    // jsdom has no object URLs; the picker only needs a string for each preview.
    createObjectURL = vi.fn(() => "blob:preview");
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: ImageCompressionService, useValue: {} },
      ],
    });
    component = TestBed.createComponent(PhotoPickerComponent).componentInstance;
  });

  afterEach(() => {
    delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL;
  });

  it.each([
    ["JPEG", "photo.jpg", "image/jpeg", JPEG],
    ["PNG", "photo.png", "image/png", PNG],
    ["GIF", "photo.gif", "image/gif", GIF],
    ["little-endian TIFF", "scan.tif", "image/tiff", TIFF_LITTLE_ENDIAN],
    ["big-endian TIFF", "scan.tif", "image/tiff", TIFF_BIG_ENDIAN],
  ])("keeps a real %s, whose leading bytes match its type", async (_label, name, type, bytes) => {
    await pick(photo(name, type, bytes));

    expect(component.files().map((image) => image.file.name)).toEqual([name]);
  });

  it("skips a HEIC renamed to .jpg exactly as it skips an unsupported type", async () => {
    await pick(photo("IMG_0001.jpg", "image/jpeg", HEIC), photo("notes.txt", "text/plain", TEXT));

    expect(component.files()).toEqual([]);
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("skips a WebP renamed to .png, since WebP is not an accepted format", async () => {
    await pick(photo("card.png", "image/png", WEBP));

    expect(component.files()).toEqual([]);
  });
});
