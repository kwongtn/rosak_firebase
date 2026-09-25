/**
 * Compares JSON-shaped values by structure for GraphQL response retention.
 *
 * This intentionally does not walk cycles and is not intended for class instances (or other
 * host objects such as Date, Map, and Set). Those values are equal only when `Object.is` says so.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }

  // An explicit work stack keeps deeply nested JSON payloads from consuming the JS call stack.
  // Cycles are intentionally unsupported: JSON responses are trees, and a cyclic input can keep
  // pushing pairs onto this stack until the comparison eventually fails or exhausts memory.
  const pending: { left: unknown; right: unknown }[] = [{ left: a, right: b }];

  while (pending.length > 0) {
    const pair = pending.pop();
    if (pair === undefined || Object.is(pair.left, pair.right)) {
      continue;
    }

    if (Array.isArray(pair.left) || Array.isArray(pair.right)) {
      if (!Array.isArray(pair.left) || !Array.isArray(pair.right)) {
        return false;
      }
      if (pair.left.length !== pair.right.length) {
        return false;
      }
      for (let index = pair.left.length - 1; index >= 0; index -= 1) {
        pending.push({ left: pair.left[index], right: pair.right[index] });
      }
      continue;
    }

    if (!isPlainObject(pair.left) || !isPlainObject(pair.right)) {
      return false;
    }

    const leftKeys = Object.keys(pair.left);
    if (leftKeys.length !== Object.keys(pair.right).length) {
      return false;
    }
    for (const key of leftKeys) {
      if (!Object.prototype.hasOwnProperty.call(pair.right, key)) {
        return false;
      }
      pending.push({ left: pair.left[key], right: pair.right[key] });
    }
  }

  return true;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
