const APP1 = 0xe1;
const SOS = 0xda;
const EOI = 0xd9;
const GPS_INFO = 0x8825;
const ENTRY_SIZE = 12;
const TYPE_LONG = 4;
const TYPE_IFD = 13;
/** Bytes per value for the TIFF field types 1..13 (BYTE, ASCII, SHORT, LONG, RATIONAL, SBYTE,
 * UNDEFINED, SSHORT, SLONG, SRATIONAL, FLOAT, DOUBLE, IFD); index 0 is not a type. */
const TYPE_SIZE = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8, 4];
const XMP_SIGNATURE = "http://ns.adobe.com/xap/1.0/\0";
const DROPPED = new Uint8Array(0);

/**
 * Lossless GPS removal for JPEG bytes (audit F044, client half): a photo must not carry the place
 * it was taken when it leaves the device. Nothing is re-encoded and only the segments that hold a
 * location change. The capture time (DateTime, DateTimeOriginal) and the camera Make/Model stay on
 * purpose: the backend sets incident-photo timestamps from the first and moderators read the second.
 *
 * - Exif APP1: the GPSInfo entry (0x8825) is removed from IFD0, the entries after it shift up and
 *   the next-IFD pointer follows the new last entry. The GPS IFD and every out-of-line value it
 *   points to (the RATIONAL latitude and longitude) are zero-filled. The Exif IFD, the IFD1
 *   thumbnail and Orientation are not touched.
 * - XMP APP1 with any GPS property (exif:GPSLatitude, exif:GPSLongitude, ...): dropped entirely.
 *   Simple and safe; the backend only reads Exif, so nothing it needs lives in XMP.
 * - Every other segment, and everything from SOS on, stays byte for byte.
 * - Input that is not a JPEG, or has no GPS, comes back unchanged (the very same Uint8Array when
 *   one was passed in, so callers can test `result === input`). PNG, WebP, HEIC, GIF and TIFF are
 *   left as they are on purpose: the server strips those.
 * - Never throws. An Exif segment that cannot be parsed safely (bad header, an offset or length
 *   outside the segment, an unknown field type) is dropped entirely: privacy beats the timestamp.
 *
 * shortcut: ExtendedXMP chunks and anything appended after EOI (MPF secondary images, a
 * motion-photo video) are not inspected, upgrade if a camera is ever seen putting GPS there.
 */
export function stripGps(input: Uint8Array<ArrayBuffer> | ArrayBuffer): Uint8Array<ArrayBuffer> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return bytes;
  }

  const edits: { start: number; end: number; replacement: Uint8Array<ArrayBuffer> }[] = [];
  let pos = 2;
  while (pos + 1 < bytes.length) {
    if (bytes[pos] !== 0xff) {
      pos += 1; // junk between segments: resync on the next 0xFF, like decoders do
      continue;
    }
    const marker = bytes[pos + 1];
    if (marker === SOS || marker === EOI) {
      break; // metadata segments all come before the scan
    }
    if (marker === 0xff || marker === 0x00) {
      pos += 1; // fill byte or stuffed zero, not a marker
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      pos += 2; // standalone marker, no length
      continue;
    }
    const length = pos + 4 <= bytes.length ? (bytes[pos + 2] << 8) | bytes[pos + 3] : 0;
    if (length < 2) {
      break; // lost sync
    }
    // A segment cut off by the end of the file is still cleaned as far as it goes.
    const end = Math.min(pos + 2 + length, bytes.length);
    if (marker === APP1) {
      const replacement = cleanApp1(bytes.subarray(pos, end));
      if (replacement) {
        edits.push({ start: pos, end, replacement });
      }
    }
    pos = end;
  }

  if (edits.length === 0) {
    return bytes;
  }
  const parts: Uint8Array[] = [];
  let from = 0;
  for (const { start, end, replacement } of edits) {
    parts.push(bytes.subarray(from, start), replacement);
    from = end;
  }
  parts.push(bytes.subarray(from));
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

type TiffResult = "unchanged" | "stripped" | "unsafe";

/** What replaces one APP1 segment (marker, length and payload): undefined keeps it, empty drops it. */
function cleanApp1(segment: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> | undefined {
  const payload = segment.subarray(4);
  // Only "Exif\0" is matched, as Pillow (the backend's reader) does before it takes the TIFF block
  // from six bytes in, so an odd sixth byte cannot let a segment slip past unchecked.
  if (startsWith(payload, "Exif\0")) {
    const exif = segment.slice();
    const result = stripTiffGps(exif.subarray(10));
    if (result === "unsafe") {
      return DROPPED;
    }
    return result === "stripped" ? exif : undefined;
  }
  // shortcut: the whole XMP packet goes, not just its GPS properties, upgrade if XMP-borne data
  // other than location is ever needed (the backend reads Exif only).
  if (startsWith(payload, XMP_SIGNATURE) && /:gps[a-z]/i.test(new TextDecoder().decode(payload))) {
    return DROPPED;
  }
  return undefined;
}

function startsWith(bytes: Uint8Array, text: string): boolean {
  return (
    bytes.length >= text.length && Array.from(text).every((ch, i) => bytes[i] === ch.charCodeAt(0))
  );
}

/**
 * Removes GPS from one Exif TIFF block in place. "unchanged" means it holds none, "stripped" that
 * the GPSInfo entry is gone and the GPS data is zeroed, "unsafe" that something was out of bounds
 * or unknown, so the caller must drop the whole block. Every read is range-checked first: this
 * must never throw.
 */
function stripTiffGps(tiff: Uint8Array): TiffResult {
  const size = tiff.length;
  if (size < 8) {
    return "unsafe";
  }
  const view = new DataView(tiff.buffer, tiff.byteOffset, size);
  const little = tiff[0] === 0x49 && tiff[1] === 0x49; // "II"; "MM" is big-endian
  if ((!little && !(tiff[0] === 0x4d && tiff[1] === 0x4d)) || view.getUint16(2, little) !== 42) {
    return "unsafe";
  }

  const ifd0 = view.getUint32(4, little);
  if (ifd0 + 2 > size) {
    return "unsafe";
  }
  const first = ifd0 + 2;
  // The next-IFD pointer sits right after the last entry.
  const next = first + view.getUint16(ifd0, little) * ENTRY_SIZE;
  if (next + 4 > size) {
    return "unsafe";
  }

  const keep: number[] = [];
  const wipe: [number, number][] = [];
  for (let entry = first; entry < next; entry += ENTRY_SIZE) {
    if (view.getUint16(entry, little) !== GPS_INFO) {
      keep.push(entry);
      continue;
    }
    const type = view.getUint16(entry + 2, little);
    const isSingleOffset =
      (type === TYPE_LONG || type === TYPE_IFD) && view.getUint32(entry + 4, little) === 1;
    if (
      !isSingleOffset ||
      !collectGpsRanges(view, little, view.getUint32(entry + 8, little), wipe)
    ) {
      return "unsafe";
    }
  }
  if (wipe.length === 0) {
    return "unchanged";
  }

  // Compact IFD0 without its GPSInfo entries; the next-IFD pointer moves up right behind the last
  // kept entry and the freed bytes at the end become unreferenced (zeroed anyway).
  const pointer = tiff.slice(next, next + 4);
  keep.forEach((from, i) => tiff.copyWithin(first + i * ENTRY_SIZE, from, from + ENTRY_SIZE));
  const end = first + keep.length * ENTRY_SIZE;
  tiff.set(pointer, end);
  tiff.fill(0, end + 4, next + 4);
  view.setUint16(ifd0, keep.length, little);
  // Last, so nothing above can write GPS bytes back.
  for (const [start, stop] of wipe) {
    tiff.fill(0, start, stop);
  }
  return "stripped";
}

/**
 * Adds to `ranges` the byte ranges that hold the GPS IFD at `ifd`: the IFD itself (count, entry
 * table, next pointer) and each out-of-line value its entries point to. False when any of it is
 * out of bounds or has a field type whose size is unknown.
 */
function collectGpsRanges(
  view: DataView,
  little: boolean,
  ifd: number,
  ranges: [number, number][],
): boolean {
  const size = view.byteLength;
  if (ifd + 2 > size) {
    return false;
  }
  const end = ifd + 2 + view.getUint16(ifd, little) * ENTRY_SIZE + 4;
  if (end > size) {
    return false;
  }
  ranges.push([ifd, end]);
  for (let entry = ifd + 2; entry < end - 4; entry += ENTRY_SIZE) {
    const unit = TYPE_SIZE[view.getUint16(entry + 2, little)];
    if (!unit) {
      return false;
    }
    const length = unit * view.getUint32(entry + 4, little);
    if (length > 4) {
      const at = view.getUint32(entry + 8, little);
      if (at + length > size) {
        return false;
      }
      ranges.push([at, at + length]);
    }
  }
  return true;
}
