import { Observable, takeWhile } from "rxjs";
import { AuthService } from "src/app/services/auth/auth.service";

import { Injectable } from "@angular/core";
import {
    ActivatedRouteSnapshot,
    CanActivate,
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
export class LoginGuard implements CanActivate, CanLoad {
    constructor(private authService: AuthService, private router: Router) {}
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
                            this.router.parseUrl("/");
                            return;
                        } else {
                            resolve(true);
                            return;
                        }
                    },
                });
        });
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
