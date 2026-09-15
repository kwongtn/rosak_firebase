/**
 * Trailing-edge debounce for the console queue search inputs: every push()
 * restarts the timer, only the last call within the window runs. The 300ms
 * window keeps typing from firing a GraphQL request per keystroke while
 * still feeling immediate.
 */
export const SEARCH_DEBOUNCE_MS = 300;

export interface TrailingDebouncer {
  push(run: () => void): void;
  cancel(): void;
  readonly isPending: boolean;
}

export function createTrailingDebounce(delayMs: number): TrailingDebouncer {
  let timer: ReturnType<typeof setTimeout> | undefined;

  return {
    push(run: () => void): void {
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        run();
      }, delayMs);
    },
    cancel(): void {
      clearTimeout(timer);
      timer = undefined;
    },
    get isPending(): boolean {
      return timer !== undefined;
    },
  };
}

/** Trimmed search term, or undefined when there is nothing to filter on —
 * matches the backend resolvers, which treat absent/blank as "no filter". */
export function searchTermOrUndefined(raw: string): string | undefined {
  const trimmed = raw.trim();
  return trimmed ? trimmed : undefined;
}
