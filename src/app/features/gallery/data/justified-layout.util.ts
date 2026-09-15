export interface JustifiedItem {
  width: number;
  height: number;
}

export interface JustifiedCell<T> {
  item: T;
  width: number;
}

export interface JustifiedRow<T> {
  height: number;
  cells: JustifiedCell<T>[];
}

/**
 * Flickr-style justified rows: each row is packed with items at a shared height until it would
 * overflow the container width, then that row's height is rescaled so its items' widths sum to
 * exactly `containerWidth` (aspect ratio preserved per item — nothing is cropped, unlike a fixed
 * `aspect-square` grid). The final, possibly-incomplete row is left at `targetRowHeight` rather
 * than stretched, matching Flickr's own behavior of not blowing up a half-empty last row.
 */
export function computeJustifiedRows<T extends JustifiedItem>(
  items: T[],
  containerWidth: number,
  targetRowHeight: number,
  gap: number,
): JustifiedRow<T>[] {
  if (containerWidth <= 0 || items.length === 0) {
    return [];
  }

  const rows: JustifiedRow<T>[] = [];
  let rowItems: T[] = [];
  let aspectSum = 0;

  for (const item of items) {
    const aspect = item.width / item.height || 1;
    rowItems.push(item);
    aspectSum += aspect;

    const gapsWidth = (rowItems.length - 1) * gap;
    const neededWidth = aspectSum * targetRowHeight + gapsWidth;
    if (neededWidth >= containerWidth) {
      const availableWidth = containerWidth - gapsWidth;
      const rowHeight = availableWidth / aspectSum;
      rows.push({
        height: rowHeight,
        cells: rowItems.map((rowItem) => ({
          item: rowItem,
          width: rowHeight * (rowItem.width / rowItem.height || 1),
        })),
      });
      rowItems = [];
      aspectSum = 0;
    }
  }

  if (rowItems.length > 0) {
    rows.push({
      height: targetRowHeight,
      cells: rowItems.map((rowItem) => ({
        item: rowItem,
        width: targetRowHeight * (rowItem.width / rowItem.height || 1),
      })),
    });
  }

  return rows;
}
