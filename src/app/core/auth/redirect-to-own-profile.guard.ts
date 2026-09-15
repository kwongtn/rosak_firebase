import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { AuthService } from "./auth.service";

/** Bare /profile has no page of its own — it always redirects, to your own /profile/:id if
 * you're signed in (Firebase's uid is the id), or to /spotting otherwise. Awaits
 * `AuthService.whenReady` first so a page refresh while genuinely logged in doesn't redirect to
 * /spotting before Firebase restores the session. */
export const redirectToOwnProfileGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.whenReady;
  const uid = auth.user()?.uid;
  return router.createUrlTree(uid ? ["/profile", uid] : ["/spotting"]);
};
