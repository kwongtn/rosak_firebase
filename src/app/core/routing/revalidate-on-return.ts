import { DestroyRef, inject } from "@angular/core";
import { NavigationEnd, Router } from "@angular/router";
import { filter } from "rxjs";

/** Returns the URL path without query parameters or the fragment. */
export function urlPath(url: string): string {
  const fragmentIndex = url.indexOf("#");
  const withoutFragment = fragmentIndex === -1 ? url : url.slice(0, fragmentIndex);
  const queryIndex = withoutFragment.indexOf("?");
  return queryIndex === -1 ? withoutFragment : withoutFragment.slice(0, queryIndex);
}

/**
 * Silently revalidates a retained resource when its route becomes active again.
 *
 * The first NavigationEnd is the component's own creation, where its resources already fetch, so
 * it is deliberately ignored. A later event reloads only when the route is re-entered from
 * outside its pattern. Navigations that remain within the same pattern (including a changed
 * `lineId`, vehicle, or query) are left alone because the route inputs/resources handle those
 * changes themselves. Call this from an injection context and let `DestroyRef` own the
 * subscription lifetime.
 */
export function revalidateOnReturn(
  isMyRoute: (urlPath: string) => boolean,
  reload: () => void,
): void {
  const router = inject(Router);
  const destroyRef = inject(DestroyRef);
  let previousPath: string | null = null;

  const subscription = router.events
    .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
    .subscribe((event) => {
      const path = urlPath(event.urlAfterRedirects);
      if (previousPath === null) {
        previousPath = path;
        return;
      }

      const wasMine = isMyRoute(previousPath);
      previousPath = path;
      if (!wasMine && isMyRoute(path)) {
        reload();
      }
    });

  destroyRef.onDestroy(() => subscription.unsubscribe());
}
