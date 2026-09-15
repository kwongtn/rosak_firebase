import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges Tailwind class lists, letting a later class override an earlier
 * conflicting one (e.g. a caller-supplied `class` overriding a component's
 * own default). Equivalent to spartan-ng's own `hlm()` helper.
 */
export function hlm(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
