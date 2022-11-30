import { Observable, takeWhile } from "rxjs";
import { AuthService, UserAuthData } from "src/app/services/auth/auth.service";

import { Injectable } from "@angular/core";
import {
    ActivatedRouteSnapshot,
    CanActivate,
    CanActivateChild,
    CanDeactivate,
    CanLoad,
    Route,
    Router,
    RouterStateSnapshot,
    UrlSegment,
    UrlTree,
} from "@angular/router";

@Injectable({
    providedIn: "root",
})
export class AdminGuard
implements CanActivate, CanActivateChild, CanDeactivate<unknown>, CanLoad
{
    permissions$: Observable<UserAuthData | null | undefined>;

    constructor(private authService: AuthService, private router: Router) {
        this.permissions$ = this.authService.userAuth$;
    }

    canActivate(
        route: ActivatedRouteSnapshot,
        state: RouterStateSnapshot
    ):
        | Observable<boolean | UrlTree>
        | Promise<boolean | UrlTree>
        | boolean
        | UrlTree {
        return new Promise((resolve, reject) => {
            this.authService.userAuth$
                .pipe(
                    takeWhile((userAuth) => {
                        return userAuth === null;
                    })
                )
                .subscribe({
                    complete: () => {
                        const userAuthData = this.authService.userAuth.value;
                        if (userAuthData === undefined) {
                            this.router.parseUrl("/404");
                            resolve(false);
                            return;
                        } else if (userAuthData === null) {
                            reject("userAuthData is null.");
                            return;
                        } else {
                            if (userAuthData.permissions) {
                                resolve(
                                    userAuthData.permissions.admin ?? false
                                );
                            }
                        }
                    },
                });
        });
    }
    canActivateChild(
        childRoute: ActivatedRouteSnapshot,
        state: RouterStateSnapshot
    ):
        | Observable<boolean | UrlTree>
        | Promise<boolean | UrlTree>
        | boolean
        | UrlTree {
        return true;
    }
    canDeactivate(
        component: unknown,
        currentRoute: ActivatedRouteSnapshot,
        currentState: RouterStateSnapshot,
        nextState?: RouterStateSnapshot
    ):
        | Observable<boolean | UrlTree>
        | Promise<boolean | UrlTree>
        | boolean
        | UrlTree {
        return true;
    }
    canLoad(
        route: Route,
        segments: UrlSegment[]
    ):
        | Observable<boolean | UrlTree>
        | Promise<boolean | UrlTree>
        | boolean
        | UrlTree {
        return true;
    }
}
