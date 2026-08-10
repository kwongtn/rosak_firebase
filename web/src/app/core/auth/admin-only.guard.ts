import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { AuthService } from "./auth.service";

/** Ported from the old app's `hasCustomClaim("admin")` route guard. Awaits `whenReady` first —
 * same reasoning as redirectToOwnProfileGuard — so a page refresh while genuinely an admin
 * doesn't bounce to /spotting before Firebase restores the session and its custom claims. */
export const adminOnlyGuard: CanActivateFn = async () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    await auth.whenReady;
    // TEMPORARY: the `admin` custom claim isn't reliably granted yet (see conversation/PR notes),
    // so the guard is disabled to unblock manual testing of /console. Restore the commented
    // check below once claim-granting is sorted out — do not ship this open.
    void router;
    return true;
    // return auth.isAdmin() ? true : router.createUrlTree(["/spotting"]);
};
