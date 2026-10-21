import { describe, expect, it } from "vitest";

import { stripGps } from "./strip-gps.util";

const ascii = (text: string): number[] => Array.from(text, (ch) => ch.charCodeAt(0));
const be16 = (value: number): number[] => [value >> 8, value & 0xff];

const MAKE = ascii("Canon\0");
const DATE_TIME = ascii("2026:10:21 08:30:00\0");
const DATE_TIME_ORIGINAL = ascii("2026:10:21 08:29:58\0");
const THUMBNAIL = [0xff, 0xd8, 0xff, 0xd9];
const XMP_HEADER = ascii("http://ns.adobe.com/xap/1.0/\0");

/** Tiny scan plus EOI: stands in for the entropy-coded image data after the metadata. */
const SCAN = [0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x12, 0x34, 0xff, 0x00];
const EOI = [0xff, 0xd9];
const JFIF = [0xff, 0xe0, 0x00, 0x10, ...ascii("JFIF\0"), 1, 1, 0, 0, 1, 0, 1, 0, 0];

const segment = (marker: number, payload: number[]): number[] => [
  0xff,
  marker,
  ...be16(payload.length + 2),
  ...payload,
];
const jpeg = (...segments: number[][]): Uint8Array<ArrayBuffer> =>
  new Uint8Array([0xff, 0xd8, ...segments.flat(), ...SCAN, ...EOI]);
const xmp = (body: string): number[] => segment(0xe1, [...XMP_HEADER, ...ascii(body)]);

const TYPE_ASCII = 2;
const TYPE_SHORT = 3;
const TYPE_LONG = 4;
const TYPE_RATIONAL = 5;
const TYPE_UNDEFINED = 7;
const ENTRY_SIZE = 12;

interface Fixture {
  bytes: Uint8Array<ArrayBuffer>;
  little: boolean;
  app1Start: number;
  app1End: number;
  /** Where the TIFF header starts in `bytes`; every Exif offset is relative to it. */
  tiffStart: number;
  /** Offsets from the TIFF header. */
  at: Record<
    | "ifd0"
    | "make"
    | "dateTime"
    | "exifIfd"
    | "dateTimeOriginal"
    | "gpsIfd"
    | "latitude"
    | "longitude"
    | "ifd1"
    | "thumbnail",
    number
  >;
}

/**
 * Hand-built TIFF block (the payload of a JPEG Exif APP1, a PNG eXIf chunk, or a whole TIFF file).
 * IFD0 holds Make, Orientation, DateTime, the Exif IFD pointer (DateTimeOriginal), GPSInfo and one
 * entry after it so the shift is exercised; the GPS IFD holds both refs and the two 3-RATIONAL
 * coordinates; IFD1 carries a thumbnail so the relocated next-IFD pointer has something to find.
 */
function buildTiff(little: boolean): { tiff: number[]; at: Fixture["at"] } {
  const u16 = (value: number) => (little ? be16(value).reverse() : be16(value));
  const u32 = (value: number) => {
    const bytes = [value >>> 24, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
    return little ? bytes.reverse() : bytes;
  };
  const rational = (numerator: number, denominator: number) => [
    ...u32(numerator),
    ...u32(denominator),
  ];
  const entry = (tag: number, type: number, count: number, value: number[]) => [
    ...u16(tag),
    ...u16(type),
    ...u32(count),
    ...value,
  ];
  const ifd = (entries: number[][], next = 0) => [
    ...u16(entries.length),
    ...entries.flat(),
    ...u32(next),
  ];
  const ifdSize = (entries: number) => 2 + entries * ENTRY_SIZE + 4;

  const ifd0 = 8;
  const make = ifd0 + ifdSize(6);
  const dateTime = make + MAKE.length;
  const exifIfd = dateTime + DATE_TIME.length;
  const dateTimeOriginal = exifIfd + ifdSize(1);
  const gpsIfd = dateTimeOriginal + DATE_TIME_ORIGINAL.length;
  const latitude = gpsIfd + ifdSize(4);
  const longitude = latitude + 24;
  const ifd1 = longitude + 24;
  const thumbnail = ifd1 + ifdSize(2);

  const tiff = [
    ...ascii(little ? "II" : "MM"),
    ...u16(42),
    ...u32(ifd0),
    ...ifd(
      [
        entry(0x010f, TYPE_ASCII, MAKE.length, u32(make)),
        entry(0x0112, TYPE_SHORT, 1, [...u16(6), 0, 0]),
        entry(0x0132, TYPE_ASCII, DATE_TIME.length, u32(dateTime)),
        entry(0x8769, TYPE_LONG, 1, u32(exifIfd)),
        entry(0x8825, TYPE_LONG, 1, u32(gpsIfd)),
        entry(0xc4a5, TYPE_UNDEFINED, 4, ascii("PIM\0")),
      ],
      ifd1,
    ),
    ...MAKE,
    ...DATE_TIME,
    ...ifd([entry(0x9003, TYPE_ASCII, DATE_TIME_ORIGINAL.length, u32(dateTimeOriginal))]),
    ...DATE_TIME_ORIGINAL,
    ...ifd([
      entry(0x0001, TYPE_ASCII, 2, [...ascii("N\0"), 0, 0]),
      entry(0x0002, TYPE_RATIONAL, 3, u32(latitude)),
      entry(0x0003, TYPE_ASCII, 2, [...ascii("E\0"), 0, 0]),
      entry(0x0004, TYPE_RATIONAL, 3, u32(longitude)),
    ]),
    ...[rational(3, 1), rational(8, 1), rational(4210, 100)].flat(),
    ...[rational(101, 1), rational(41, 1), rational(3055, 100)].flat(),
    ...ifd([
      entry(0x0201, TYPE_LONG, 1, u32(thumbnail)),
      entry(0x0202, TYPE_LONG, 1, u32(THUMBNAIL.length)),
    ]),
    ...THUMBNAIL,
  ];
  // Guards the offsets above: a slip here would make every assertion below meaningless.
  expect(tiff.length).toBe(thumbnail + THUMBNAIL.length);

  return {
    tiff,
    at: {
      ifd0,
      make,
      dateTime,
      exifIfd,
      dateTimeOriginal,
      gpsIfd,
      latitude,
      longitude,
      ifd1,
      thumbnail,
    },
  };
}

/** Hand-built JPEG: SOI, JFIF APP0, an Exif APP1 holding `buildTiff` and a tiny scan. */
function buildJpeg(little: boolean): Fixture {
  const { tiff, at } = buildTiff(little);
  const app0Start = 2;
  const app1Start = app0Start + JFIF.length;
  const app1 = segment(0xe1, [...ascii("Exif\0\0"), ...tiff]);
  return {
    bytes: jpeg(JFIF, app1),
    little,
    app1Start,
    app1End: app1Start + app1.length,
    tiffStart: app1Start + 10,
    at,
  };
}

interface IfdEntry {
  tag: number;
  type: number;
  count: number;
  value: number;
}

/** Independent reader (not the code under test): the entries of the IFD at `offset` plus its next pointer. */
function readIfd(fixture: Fixture, bytes: Uint8Array, offset: number) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  const base = fixture.tiffStart + offset;
  const count = view.getUint16(base, fixture.little);
  const entries: IfdEntry[] = Array.from({ length: count }, (_, i) => {
    const at = base + 2 + i * ENTRY_SIZE;
    return {
      tag: view.getUint16(at, fixture.little),
      type: view.getUint16(at + 2, fixture.little),
      count: view.getUint32(at + 4, fixture.little),
      value: view.getUint32(at + 8, fixture.little),
    };
  });
  return { entries, next: view.getUint32(base + 2 + count * ENTRY_SIZE, fixture.little) };
}

function readAscii(fixture: Fixture, bytes: Uint8Array, entry: IfdEntry): string {
  const start = fixture.tiffStart + entry.value;
  return String.fromCharCode(...bytes.subarray(start, start + entry.count - 1));
}

function indexOfBytes(haystack: Uint8Array, needle: Uint8Array): number {
  for (let i = 0; i + needle.length <= haystack.length; i += 1) {
    if (needle.every((byte, j) => haystack[i + j] === byte)) {
      return i;
    }
  }
  return -1;
}

describe.each([
  { order: "little-endian (II)", little: true },
  { order: "big-endian (MM)", little: false },
])("stripGps on $order Exif", ({ little }) => {
  const fixture = buildJpeg(little);
  const original = fixture.bytes.slice();
  const stripped = stripGps(fixture.bytes);
  const { at, tiffStart } = fixture;
  const ifd0Entries = (bytes: Uint8Array) => readIfd(fixture, bytes, at.ifd0);

  it("starts from a fixture that really carries GPS", () => {
    const before = ifd0Entries(original);
    expect(before.entries.map((e) => e.tag)).toEqual([
      0x010f, 0x0112, 0x0132, 0x8769, 0x8825, 0xc4a5,
    ]);
    expect(readIfd(fixture, original, at.gpsIfd).entries.map((e) => e.tag)).toEqual([1, 2, 3, 4]);
  });

  it("removes the GPSInfo entry from IFD0 and shifts the entries after it up", () => {
    const after = ifd0Entries(stripped);

    expect(after.entries.map((e) => e.tag)).toEqual([0x010f, 0x0112, 0x0132, 0x8769, 0xc4a5]);
    expect(after.entries.map((e) => e.tag)).not.toContain(0x8825);
    // The entry that moved up is intact, including its inline value.
    expect(after.entries[4]).toEqual({
      tag: 0xc4a5,
      type: TYPE_UNDEFINED,
      count: 4,
      value: ifd0Entries(original).entries[5].value,
    });
  });

  it("keeps the next-IFD pointer right after the last entry so IFD1 stays reachable", () => {
    const after = ifd0Entries(stripped);

    expect(after.next).toBe(at.ifd1);
    const thumbnail = readIfd(fixture, stripped, after.next);
    expect(thumbnail.entries.map((e) => e.tag)).toEqual([0x0201, 0x0202]);
    expect(
      Array.from(stripped.subarray(tiffStart + at.thumbnail, tiffStart + at.thumbnail + 4)),
    ).toEqual(THUMBNAIL);
  });

  it("zero-fills the GPS IFD and the coordinates it pointed to", () => {
    const gpsStart = tiffStart + at.gpsIfd;
    const gpsEnd = tiffStart + at.longitude + 24;

    expect(stripped.subarray(gpsStart, gpsEnd).every((byte) => byte === 0)).toBe(true);
    for (const coordinate of [at.latitude, at.longitude]) {
      const bytes = original.subarray(tiffStart + coordinate, tiffStart + coordinate + 24);
      expect(indexOfBytes(original, bytes)).toBeGreaterThan(-1);
      expect(indexOfBytes(stripped, bytes)).toBe(-1);
    }
  });

  it("keeps Make, DateTime and DateTimeOriginal readable", () => {
    const entries = ifd0Entries(stripped).entries;
    const byTag = (tag: number): IfdEntry => {
      const found = entries.find((e) => e.tag === tag);
      if (!found) {
        throw new Error(`IFD0 lost tag 0x${tag.toString(16)}`);
      }
      return found;
    };

    expect(readAscii(fixture, stripped, byTag(0x010f))).toBe("Canon");
    expect(readAscii(fixture, stripped, byTag(0x0132))).toBe("2026:10:21 08:30:00");
    const exif = readIfd(fixture, stripped, byTag(0x8769).value);
    expect(readAscii(fixture, stripped, exif.entries[0])).toBe("2026:10:21 08:29:58");
  });

  it("changes nothing but the IFD0 table and the GPS data", () => {
    const ifd0Start = tiffStart + at.ifd0;
    const ifd0End = ifd0Start + 2 + 6 * ENTRY_SIZE + 4;
    const gpsStart = tiffStart + at.gpsIfd;
    const gpsEnd = tiffStart + at.longitude + 24;

    expect(stripped.length).toBe(original.length);
    const changed = Array.from(stripped, (byte, i) => (byte === original[i] ? -1 : i)).filter(
      (i) => i >= 0,
    );
    expect(changed.length).toBeGreaterThan(0);
    expect(
      changed.every((i) => (i >= ifd0Start && i < ifd0End) || (i >= gpsStart && i < gpsEnd)),
    ).toBe(true);
  });

  it("leaves the bytes after APP1 and the segments before it identical", () => {
    expect(Array.from(stripped.subarray(fixture.app1End))).toEqual(
      Array.from(original.subarray(fixture.app1End)),
    );
    expect(Array.from(stripped.subarray(0, fixture.app1Start))).toEqual(
      Array.from(original.subarray(0, fixture.app1Start)),
    );
    expect(Array.from(stripped.subarray(fixture.app1End, fixture.app1End + SCAN.length))).toEqual(
      SCAN,
    );
  });

  it("does not modify the input it was given", () => {
    expect(Array.from(fixture.bytes)).toEqual(Array.from(original));
    expect(stripped).not.toBe(fixture.bytes);
  });

  it("returns the very same object when there is no GPS left to remove", () => {
    expect(stripGps(stripped)).toBe(stripped);
  });
});

describe("stripGps", () => {
  it("returns non-JPEG input unchanged", () => {
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xe1, 0x00, 0x02,
    ]);
    const empty = new Uint8Array(0);

    expect(stripGps(png)).toBe(png);
    expect(stripGps(empty)).toBe(empty);
    expect(Array.from(stripGps(new Uint8Array([0xff]).buffer))).toEqual([0xff]);
  });

  it("returns a JPEG with no Exif or XMP as the very same object", () => {
    const plain = jpeg(JFIF);

    expect(stripGps(plain)).toBe(plain);
  });

  it("accepts an ArrayBuffer", () => {
    const fixture = buildJpeg(true);
    const stripped = stripGps(fixture.bytes.slice().buffer);

    expect(readIfd(fixture, stripped, fixture.at.ifd0).entries.map((e) => e.tag)).not.toContain(
      0x8825,
    );
  });

  it("works on a view into a larger buffer", () => {
    const fixture = buildJpeg(false);
    const padded = new Uint8Array(fixture.bytes.length + 7);
    padded.set(fixture.bytes, 7);
    const stripped = stripGps(padded.subarray(7));

    expect(readIfd(fixture, stripped, fixture.at.ifd0).entries.map((e) => e.tag)).not.toContain(
      0x8825,
    );
  });

  it("accepts a GPSInfo entry written with the IFD field type", () => {
    const fixture = buildJpeg(true);
    fixture.bytes[fixture.tiffStart + fixture.at.ifd0 + 2 + 4 * ENTRY_SIZE + 2] = 13;

    const stripped = stripGps(fixture.bytes);

    expect(stripped.length).toBe(fixture.bytes.length);
    expect(readIfd(fixture, stripped, fixture.at.ifd0).entries.map((e) => e.tag)).not.toContain(
      0x8825,
    );
  });

  it("leaves a valid empty IFD0 when GPSInfo was its only entry", () => {
    const tiff = [
      ...[...ascii("II"), 42, 0, 8, 0, 0, 0], // header, IFD0 at 8
      ...[1, 0], // IFD0: one entry
      ...[0x25, 0x88, 4, 0, 1, 0, 0, 0, 26, 0, 0, 0], // GPSInfo: GPS IFD at 26
      ...[0x34, 0x12, 0, 0], // next-IFD pointer, which must survive the move
      ...[1, 0], // GPS IFD at 26: one entry
      ...[1, 0, 2, 0, 2, 0, 0, 0, 0x4e, 0, 0, 0], // GPSLatitudeRef "N"
      ...[0, 0, 0, 0],
    ];
    const tiffStart = 2 + 4 + 6;

    const stripped = stripGps(jpeg(segment(0xe1, [...ascii("Exif\0\0"), ...tiff])));

    const block = Array.from(stripped.subarray(tiffStart, tiffStart + tiff.length));
    expect(block.slice(8, 14)).toEqual([0, 0, 0x34, 0x12, 0, 0]); // count 0, pointer right behind it
    expect(block.slice(14).every((byte) => byte === 0)).toBe(true); // freed entry and GPS IFD
  });

  describe("XMP", () => {
    const withGps = (body: string) => xmp(`<x:xmpmeta><rdf:Description ${body}/></x:xmpmeta>`);

    it.each([
      ["an exif:GPSLatitude attribute", withGps('exif:GPSLatitude="3,8.7012N"')],
      [
        "an exif:GPSLongitude element",
        xmp("<x:xmpmeta><exif:GPSLongitude>101,41.5E</exif:GPSLongitude></x:xmpmeta>"),
      ],
      ["another namespace's GPS property", withGps('drone-dji:GpsLatitude="3.14"')],
    ])("drops an XMP segment with %s and nothing else", (_, packet) => {
      const input = jpeg(JFIF, packet, segment(0xe2, ascii("ICC_PROFILE\0")));

      expect(Array.from(stripGps(input))).toEqual(
        Array.from(jpeg(JFIF, segment(0xe2, ascii("ICC_PROFILE\0")))),
      );
    });

    it("keeps an XMP segment without GPS properties as the same object", () => {
      const input = jpeg(
        JFIF,
        xmp(
          '<x:xmpmeta><rdf:Description dc:title="Train" exif:DateTimeOriginal="2026-10-21T08:29:58"/></x:xmpmeta>',
        ),
      );

      expect(stripGps(input)).toBe(input);
    });

    it("handles Exif GPS and XMP GPS in the same file", () => {
      const fixture = buildJpeg(true);
      const exifApp1 = Array.from(fixture.bytes.subarray(fixture.app1Start, fixture.app1End));
      const input = jpeg(JFIF, xmp('<rdf:Description exif:GPSLatitude="3,8.7N"/>'), exifApp1);
      const stripped = stripGps(input);

      expect(indexOfBytes(stripped, new TextEncoder().encode("GPSLatitude"))).toBe(-1);
      expect(
        indexOfBytes(
          stripped,
          fixture.bytes.subarray(
            fixture.tiffStart + fixture.at.latitude,
            fixture.tiffStart + fixture.at.latitude + 24,
          ),
        ),
      ).toBe(-1);
      expect(indexOfBytes(stripped, new TextEncoder().encode("Canon"))).toBeGreaterThan(-1);
    });
  });

  describe("an Exif segment that cannot be parsed safely", () => {
    /** Each mutation breaks the little-endian fixture in a way that makes the GPS data unreachable to trust. */
    const breakages: [string, (fixture: Fixture) => void][] = [
      ["a bad byte-order mark", (f) => f.bytes.set(ascii("XX"), f.tiffStart)],
      ["a wrong TIFF magic", (f) => (f.bytes[f.tiffStart + 2] = 43)],
      [
        "an IFD0 whose entry count overruns the segment",
        (f) => f.bytes.set([0xff, 0xff], f.tiffStart + f.at.ifd0),
      ],
      [
        "a GPSInfo offset outside the segment",
        (f) => f.bytes.set([0xfe, 0xff, 0, 0], f.tiffStart + f.at.ifd0 + 2 + 4 * ENTRY_SIZE + 8),
      ],
      [
        "a GPSInfo entry that is not a single LONG",
        (f) => (f.bytes[f.tiffStart + f.at.ifd0 + 2 + 4 * ENTRY_SIZE + 4] = 2),
      ],
      [
        "a GPS IFD whose entry count overruns the segment",
        (f) => f.bytes.set([0xff, 0xff], f.tiffStart + f.at.gpsIfd),
      ],
      ["a GPS field of an unknown type", (f) => (f.bytes[f.tiffStart + f.at.gpsIfd + 2 + 2] = 99)],
      [
        "a coordinate value outside the segment",
        (f) => f.bytes.set([0xf0, 0xff, 0, 0], f.tiffStart + f.at.gpsIfd + 2 + ENTRY_SIZE + 8),
      ],
    ];

    it.each(breakages)("drops the whole Exif segment for %s", (_, breakIt) => {
      const fixture = buildJpeg(true);
      const withoutApp1 = Array.from(fixture.bytes.subarray(0, fixture.app1Start)).concat(
        Array.from(fixture.bytes.subarray(fixture.app1End)),
      );
      breakIt(fixture);

      expect(Array.from(stripGps(fixture.bytes))).toEqual(withoutApp1);
    });

    it("drops an Exif segment cut off by the end of the file", () => {
      const fixture = buildJpeg(true);
      const cut = fixture.bytes.slice(0, fixture.tiffStart + fixture.at.latitude + 10);

      expect(Array.from(stripGps(cut))).toEqual(
        Array.from(fixture.bytes.subarray(0, fixture.app1Start)),
      );
    });
  });

  describe("on damaged input", () => {
    it.each([true, false])(
      "never throws, and never leaks the coordinates, when truncated (little-endian: %s)",
      (little) => {
        const fixture = buildJpeg(little);
        const coordinates = [fixture.at.latitude, fixture.at.longitude].map((offset) =>
          fixture.bytes.slice(fixture.tiffStart + offset, fixture.tiffStart + offset + 24),
        );

        for (let length = 0; length <= fixture.bytes.length; length += 1) {
          const stripped = stripGps(fixture.bytes.slice(0, length));
          for (const bytes of coordinates) {
            expect(indexOfBytes(stripped, bytes), `truncated at ${length}`).toBe(-1);
          }
        }
      },
    );

    it.each([true, false])("never throws on corrupted Exif bytes (little-endian: %s)", (little) => {
      const fixture = buildJpeg(little);
      // Park-Miller generator: deterministic, so a failure here reproduces.
      let seed = 48271;
      const random = (limit: number) => {
        seed = (seed * 48271) % 2147483647;
        return seed % limit;
      };

      for (let run = 0; run < 3000; run += 1) {
        const corrupted = fixture.bytes.slice();
        for (let flips = 0; flips <= run % 4; flips += 1) {
          corrupted[fixture.app1Start + random(fixture.app1End - fixture.app1Start)] = random(256);
        }
        expect(() => stripGps(corrupted), `run ${run}`).not.toThrow();
      }
    });

    it("stops at a segment with an impossible length instead of looping or throwing", () => {
      const input = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x00, 0xff, 0xe1]);

      expect(stripGps(input)).toBe(input);
    });
  });
});

const PIXELS = [0x11, 0x22, 0x33, 0x44];

describe.each([
  { order: "little-endian (II*\\0)", little: true },
  { order: "big-endian (MM\\0*)", little: false },
])("stripGps on a $order TIFF file", ({ little }) => {
  const { tiff, at } = buildTiff(little);
  const bytes = new Uint8Array([...tiff, ...PIXELS]);
  const fixture: Fixture = { bytes, little, app1Start: 0, app1End: 0, tiffStart: 0, at };
  const original = bytes.slice();
  const stripped = stripGps(bytes);
  const coordinates = [at.latitude, at.longitude].map((offset) =>
    original.slice(offset, offset + 24),
  );

  it("starts from a fixture that really carries GPS", () => {
    expect(readIfd(fixture, original, at.ifd0).entries.map((e) => e.tag)).toContain(0x8825);
    for (const block of coordinates) {
      expect(indexOfBytes(original, block)).toBeGreaterThan(-1);
    }
  });

  it("removes GPSInfo from IFD0 and zero-fills the GPS IFD and its coordinates", () => {
    const after = readIfd(fixture, stripped, at.ifd0);

    expect(after.entries.map((e) => e.tag)).toEqual([0x010f, 0x0112, 0x0132, 0x8769, 0xc4a5]);
    expect(after.next).toBe(at.ifd1);
    expect(stripped.subarray(at.gpsIfd, at.longitude + 24).every((byte) => byte === 0)).toBe(true);
    for (const block of coordinates) {
      expect(indexOfBytes(stripped, block)).toBe(-1);
    }
  });

  it("keeps Make, DateTime, the thumbnail and the data after the directories", () => {
    const text = String.fromCharCode(...stripped);

    expect(text).toContain("Canon");
    expect(text).toContain("2026:10:21 08:30:00");
    expect(text).toContain("2026:10:21 08:29:58");
    expect(stripped.length).toBe(original.length);
    expect(Array.from(stripped.subarray(at.thumbnail))).toEqual(
      Array.from(original.subarray(at.thumbnail)),
    );
  });

  it("does not modify its input, and returns the same object once there is no GPS left", () => {
    expect(Array.from(bytes)).toEqual(Array.from(original));
    expect(stripped).not.toBe(bytes);
    expect(stripGps(stripped)).toBe(stripped);
  });
});

describe("stripGps on a TIFF file it cannot parse safely", () => {
  it("zeroes the IFD0 pointer and changes nothing else", () => {
    const { tiff, at } = buildTiff(true);
    const bytes = new Uint8Array([...tiff, ...PIXELS]);
    // GPSInfo (the 5th IFD0 entry) now points outside the file.
    bytes.set([0xfe, 0xff, 0, 0], at.ifd0 + 2 + 4 * ENTRY_SIZE + 8);
    const original = bytes.slice();

    const stripped = stripGps(bytes);

    expect(Array.from(stripped.subarray(0, 4))).toEqual(ascii("II*\0"));
    expect(Array.from(stripped.subarray(4, 8))).toEqual([0, 0, 0, 0]);
    expect(Array.from(stripped.subarray(8))).toEqual(Array.from(original.subarray(8)));
    expect(Array.from(bytes)).toEqual(Array.from(original));
  });

  it("does the same for an IFD0 outside the file and for a header with nothing after it", () => {
    const outside = new Uint8Array([...ascii("MM"), 0, 42, 0xff, 0xff, 0xff, 0xff]);
    const header = new Uint8Array(ascii("II*\0"));

    expect(Array.from(stripGps(outside))).toEqual([...ascii("MM"), 0, 42, 0, 0, 0, 0]);
    expect(Array.from(stripGps(header))).toEqual(ascii("II*\0"));
  });

  it("never throws on corrupted bytes", () => {
    const { tiff } = buildTiff(true);
    let seed = 48271;
    const random = (limit: number) => {
      seed = (seed * 48271) % 2147483647;
      return seed % limit;
    };

    for (let run = 0; run < 500; run += 1) {
      const corrupted = new Uint8Array(tiff);
      for (let flips = 0; flips <= run % 4; flips += 1) {
        corrupted[4 + random(corrupted.length - 4)] = random(256);
      }
      expect(() => stripGps(corrupted), `run ${run}`).not.toThrow();
    }
  });

  it("leaves BigTIFF, which it does not read, as it is", () => {
    const bigTiff = new Uint8Array([...ascii("II"), 43, 0, 8, 0, 0, 0, 0, 0]);

    expect(stripGps(bigTiff)).toBe(bigTiff);
  });
});

describe("stripGps on PNG", () => {
  const be32 = (value: number): number[] => [
    value >>> 24,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ];
  /** The CRC is a placeholder: the code under test never reads it and must not change it. */
  const chunk = (type: string, data: number[], crc = 0xc0ffee00): number[] => [
    ...be32(data.length),
    ...ascii(type),
    ...data,
    ...be32(crc),
  ];
  const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const IHDR = chunk("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0], 0x11111111);
  const IDAT = chunk("IDAT", PIXELS, 0x22222222);
  const IEND = chunk("IEND", [], 0x33333333);
  const png = (...middle: number[][]): Uint8Array<ArrayBuffer> =>
    new Uint8Array([...SIGNATURE, ...IHDR, ...middle.flat(), ...IDAT, ...IEND]);
  /** One IFD0 with Make "Canon" and nothing else. */
  const NO_GPS_TIFF = [
    ...[...ascii("MM"), 0, 42, 0, 0, 0, 8],
    ...[0, 1, 0x01, 0x0f, 0, 2, 0, 0, 0, 6, 0, 0, 0, 26],
    ...[0, 0, 0, 0],
    ...MAKE,
  ];

  it.each([true, false])(
    "drops an eXIf chunk with GPS and keeps every other chunk byte for byte (little-endian: %s)",
    (little) => {
      const { tiff } = buildTiff(little);
      const input = png(chunk("eXIf", tiff, 0x44444444), chunk("tEXt", ascii("Title\0Train")));
      const original = input.slice();

      const output = stripGps(input);

      expect(Array.from(output)).toEqual(Array.from(png(chunk("tEXt", ascii("Title\0Train")))));
      expect(Array.from(input)).toEqual(Array.from(original));
    },
  );

  it("keeps an eXIf chunk without GPS, as the same object", () => {
    const input = png(chunk("eXIf", NO_GPS_TIFF));

    expect(stripGps(input)).toBe(input);
  });

  it("drops only the eXIf chunk that has GPS when there are two", () => {
    const { tiff } = buildTiff(true);
    const keep = chunk("eXIf", NO_GPS_TIFF, 0x55555555);

    expect(Array.from(stripGps(png(keep, chunk("eXIf", tiff))))).toEqual(Array.from(png(keep)));
  });

  it.each([
    ["not a TIFF block", chunk("eXIf", ascii("not a tiff block at all"))],
    ["empty", chunk("eXIf", [])],
    [
      "a GPSInfo offset outside the chunk",
      chunk("eXIf", [
        ...[...ascii("MM"), 0, 42, 0, 0, 0, 8],
        ...[0, 1, 0x88, 0x25, 0, 4, 0, 0, 0, 1, 0, 0, 0xff, 0xfe],
        ...[0, 0, 0, 0],
      ]),
    ],
  ])("drops an eXIf chunk that is %s", (_, exif) => {
    expect(Array.from(stripGps(png(exif)))).toEqual(Array.from(png()));
  });

  it("drops an eXIf chunk cut off by the end of the file", () => {
    const { tiff } = buildTiff(true);
    const cut = png(chunk("eXIf", tiff)).slice(0, SIGNATURE.length + IHDR.length + 8 + 40);

    expect(Array.from(stripGps(cut))).toEqual([...SIGNATURE, ...IHDR]);
  });

  it("returns a PNG with no eXIf chunk as the same object", () => {
    const input = png(chunk("tEXt", ascii("Title\0Train")));

    expect(stripGps(input)).toBe(input);
  });

  it("drops the GPS chunk of an intact file and never throws on corrupted bytes", () => {
    const { tiff, at } = buildTiff(true);
    const input = png(chunk("eXIf", tiff));
    const latitude = new Uint8Array(tiff).slice(at.latitude, at.latitude + 24);
    let seed = 48271;
    const random = (limit: number) => {
      seed = (seed * 48271) % 2147483647;
      return seed % limit;
    };

    expect(indexOfBytes(stripGps(input), latitude)).toBe(-1);
    for (let run = 0; run < 500; run += 1) {
      const corrupted = input.slice();
      for (let flips = 0; flips <= run % 4; flips += 1) {
        corrupted[random(corrupted.length)] = random(256);
      }
      expect(() => stripGps(corrupted), `run ${run}`).not.toThrow();
    }
  });
});
