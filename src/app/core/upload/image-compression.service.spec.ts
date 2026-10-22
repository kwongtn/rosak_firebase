import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ImageCompressionService } from "./image-compression.service";
import { stripGps } from "./strip-gps.util";

/** A decoded 1000 x 1000 image; the canvas below turns every draw into `width * height / 100` bytes. */
const NATURAL = 1000;
const BYTES_PER_PIXEL = 0.01;

/** Stands in for a decoded `<img>`: jsdom decodes nothing, so `src` just fires `onload`. */
class FakeImage {
  onload: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  naturalWidth = NATURAL;
  naturalHeight = NATURAL;
  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

/**
 * A big-endian or little-endian Exif TIFF block: IFD0 {Make "Canon", Orientation, GPSInfo} and a GPS
 * IFD {GPSLatitudeRef, GPSLatitude} whose 24 coordinate bytes are all 0xab, so a surviving
 * coordinate is easy to spot.
 */
function exifJpeg(options: {
  orientation: number;
  little?: boolean;
  gps?: boolean;
}): Uint8Array<ArrayBuffer> {
  const { orientation, little = true, gps = true } = options;
  const u16 = (n: number) => (little ? [n & 0xff, n >> 8] : [n >> 8, n & 0xff]);
  const u32 = (n: number) =>
    (little ? [n, n >> 8, n >> 16, n >> 24] : [n >> 24, n >> 16, n >> 8, n]).map((b) => b & 0xff);
  const ascii = (text: string) => Array.from(text, (ch) => ch.charCodeAt(0));
  const entries = gps ? 3 : 2;
  const makeAt = 8 + 2 + entries * 12 + 4;
  const gpsAt = makeAt + 6;
  const tiff = [
    ...(little ? [0x49, 0x49] : [0x4d, 0x4d]),
    ...u16(42),
    ...u32(8), // IFD0 at 8
    ...u16(entries),
    ...[...u16(0x010f), ...u16(2), ...u32(6), ...u32(makeAt)], // Make: 6 ASCII
    ...[...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), 0, 0], // Orientation: 1 SHORT
    ...(gps ? [...u16(0x8825), ...u16(4), ...u32(1), ...u32(gpsAt)] : []), // GPSInfo: the GPS IFD
    ...u32(0), // no IFD1
    ...ascii("Canon\0"),
    ...(gps
      ? [
          ...u16(2),
          ...[...u16(1), ...u16(2), ...u32(2), 0x4e, 0, 0, 0], // GPSLatitudeRef "N"
          ...[...u16(2), ...u16(5), ...u32(3), ...u32(gpsAt + 2 + 24 + 4)], // GPSLatitude: 3 RATIONAL
          ...u32(0),
          ...new Array<number>(24).fill(0xab),
        ]
      : []),
  ];
  const app1 = [0xff, 0xe1, ...[(2 + 6 + tiff.length) >> 8, (2 + 6 + tiff.length) & 0xff]];
  return new Uint8Array([
    0xff,
    0xd8,
    ...app1,
    ...ascii("Exif\0\0"),
    ...tiff,
    ...[0xff, 0xdb, 0x00, 0x04, 0x01, 0x02], // a quantisation table, so "no APP1" is not "no segments"
    ...[0xff, 0xda, 0x00, 0x02, 0x12, 0x34, 0xff, 0xd9],
  ]);
}

/** A JPEG with no Exif at all. */
function plainJpeg(): Uint8Array<ArrayBuffer> {
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xdb, 0x00, 0x04, 0x01, 0x02, 0xff, 0xda, 0x00, 0x02, 0x12, 0x34, 0xff, 0xd9,
  ]);
}

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0x49, 0x48, 0x44, 0x52,
]);

const bytesOf = async (file: Blob) => new Uint8Array(await file.arrayBuffer());
const text = (bytes: Uint8Array) => String.fromCharCode(...bytes);

/** What the canvas encoded for one draw: a tiny "JPEG" of `width * height / 100` bytes. */
function encoded(width: number, height: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(Math.max(4, Math.round(width * height * BYTES_PER_PIXEL)));
  out.set([0xff, 0xd8], 0);
  out.set([0xff, 0xd9], out.length - 2);
  return out;
}

describe("ImageCompressionService", () => {
  let service: ImageCompressionService;
  /** Every size the canvas was asked to encode, in order. */
  let draws: { width: number; height: number }[];

  beforeEach(() => {
    service = new ImageCompressionService();
    draws = [];
    vi.stubGlobal("Image", FakeImage);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (
      this: HTMLCanvasElement,
      callback: BlobCallback,
      type?: string,
    ) {
      draws.push({ width: this.width, height: this.height });
      callback(new Blob([encoded(this.width, this.height)], { type }));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const file = (bytes: Uint8Array<ArrayBuffer>, type = "image/jpeg", name = "train.jpg") =>
    new File([bytes], name, { type, lastModified: 1_700_000_000_000 });

  describe("resizeToSize", () => {
    it("re-attaches a JPEG's Exif segment, Make included, with the Orientation reset to 1", async () => {
      const out = await service.resizeToSize(file(exifJpeg({ orientation: 6 })), 1_000_000);

      const bytes = await bytesOf(out);
      expect(Array.from(bytes.slice(0, 4))).toEqual([0xff, 0xd8, 0xff, 0xe1]);
      expect(text(bytes)).toContain("Exif");
      expect(text(bytes)).toContain("Canon");
      // IFD0 entry 2 is Orientation: 2 (SOI) + 4 (APP1 header) + 6 ("Exif") + 8 (TIFF header) + 2 + 12.
      expect(bytes[2 + 4 + 6 + 8 + 2 + 12 + 8]).toBe(1);
      expect([out.name, out.type]).toEqual(["train.jpg", "image/jpeg"]);
    });

    it("resets a big-endian Orientation too", async () => {
      const out = await service.resizeToSize(
        file(exifJpeg({ orientation: 8, little: false })),
        1_000_000,
      );

      const bytes = await bytesOf(out);
      const entry = 2 + 4 + 6 + 8 + 2 + 12;
      expect(Array.from(bytes.slice(entry + 8, entry + 10))).toEqual([0, 1]);
    });

    it("leaves a GPS-free upload once the send step has cleaned the re-attached Exif", async () => {
      const out = await service.resizeToSize(file(exifJpeg({ orientation: 6 })), 1_000_000);

      const sent = stripGps(await bytesOf(out));

      expect(sent.includes(0xab)).toBe(false);
      expect(text(sent)).toContain("Canon");
    });

    it("adds no segment to a JPEG that has no Exif", async () => {
      const out = await service.resizeToSize(file(plainJpeg()), 1_000_000);

      expect(await bytesOf(out)).toEqual(encoded(NATURAL, NATURAL));
    });

    it("compresses a PNG without Exif, as a JPEG, instead of rejecting", async () => {
      const out = await service.resizeToSize(file(PNG, "image/png", "train.png"), 1_000_000);

      expect(await bytesOf(out)).toEqual(encoded(NATURAL, NATURAL));
      // The bytes are the canvas's JPEG, so the label says so and not "image/png".
      expect(out.type).toBe("image/jpeg");
      // ... and the extension, which the backend stores the file under.
      expect(out.name).toBe("train.jpg");
    });

    it.each([
      ["photo.png", "photo.jpg"],
      ["my.holiday.WEBP", "my.holiday.jpg"],
      ["noextension", "noextension.jpg"],
      ["photo.JPEG", "photo.JPEG"],
    ])("renames %s to %s when the output is a JPEG", async (name, expected) => {
      const out = await service.resizeToSize(file(PNG, "image/png", name), 1_000_000);

      expect(out.name).toBe(expected);
    });

    it.each([
      ["only the SOI marker", exifJpeg({ orientation: 6 }).slice(0, 2)],
      ["a cut inside the APP1 header", exifJpeg({ orientation: 6 }).slice(0, 7)],
      ["a cut inside the APP1 payload", exifJpeg({ orientation: 6 }).slice(0, 40)],
      [
        "a length that runs past the end",
        new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0xff, 0xff, 1, 2]),
      ],
      ["bytes that are not markers", new Uint8Array([0xff, 0xd8, 0x00, 0x11, 0x22, 0x33, 0x44])],
      ["an empty file", new Uint8Array(0)],
    ])("settles for a truncated JPEG (%s) with no Exif in the output", async (_name, bytes) => {
      const out = await service.resizeToSize(file(bytes), 1_000_000);

      expect(await bytesOf(out)).toEqual(encoded(NATURAL, NATURAL));
    });

    it("rejects, and does not hang, when the browser cannot encode the image", async () => {
      vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation((callback) =>
        callback(null),
      );

      await expect(service.resizeToSize(file(plainJpeg()), 1_000_000)).rejects.toThrow(
        "could not re-encode",
      );
    });

    it("stops at the first draw when the photo already fits", async () => {
      await service.resizeToSize(file(plainJpeg()), 1_000_000);

      expect(draws).toEqual([{ width: NATURAL, height: NATURAL }]);
    });

    it("takes several steps to reach a size limit, and the image lands at or under it", async () => {
      const limit = 3_000; // the full size is 10,000 bytes
      const input = exifJpeg({ orientation: 1, gps: false });
      const exifSize = ((input[4] << 8) | input[5]) + 2; // APP1 length field, plus the marker

      const out = await service.resizeToSize(file(input), limit);

      // The first draw is the full-size one; the search then narrows in on the limit.
      expect(draws.length).toBeGreaterThan(3);
      expect(draws.length).toBeLessThan(15);
      expect(draws[0]).toEqual({ width: NATURAL, height: NATURAL });
      // The limit holds the canvas output; the re-attached Exif segment comes on top of it.
      expect(out.size - exifSize).toBeLessThanOrEqual(limit);
      expect(out.size - exifSize).toBeGreaterThan(limit * 0.9);
    });

    it("keeps the last size that fit when the search ends on one that was too big", async () => {
      // The search steps through 500, 750, 625, 563, 532, 547, 555, 551 and ends on 549 px, which
      // encodes 3,014 bytes: one over. The step before it, 547 px, is 2,992 bytes.
      const limit = 3_010;

      const out = await service.resizeToSize(file(plainJpeg()), limit);

      expect(out.size).toBe(2_992);
    });
  });

  describe("resizeImage", () => {
    it("scales to the width limit and keeps the aspect ratio", async () => {
      await service.resizeImage(file(plainJpeg()), Infinity, 500);

      expect(draws).toEqual([{ width: 500, height: 500 }]);
    });
  });
});
