import { HttpContextToken, type HttpInterceptorFn } from "@angular/common/http";
import { InjectionToken, inject, signal, type WritableSignal } from "@angular/core";
import { from, switchMap } from "rxjs";

import type { AuthService } from "../auth/auth.service";
import { environment } from "../../../environments/environment";

/** The header the backend reads the viewer from (`FirebaseUser.get_current_user`). */
export const AUTH_HEADER = "firebase-auth-key";

/**
 * Set on a request to send it without the viewer's token: a public read whose answer is the same
 * for everyone, so it stays in the SSR transfer cache and in the backend's anonymous cache entry.
 * `graphqlResource()` sets it unless asked for `authenticated: true`.
 */
export const ANONYMOUS = new HttpContextToken<boolean>(() => false);

/**
 * The signed-in session the interceptor reads. `AuthService` puts itself here when it starts: it
 * carries Firebase Auth (a lazy chunk of about 91 kB) and this interceptor is in `main`, so the
 * interceptor must not import it. Until then nothing has restored a session, so a request is
 * anonymous, which is what an early `auth.idToken()` gave the call sites before this interceptor.
 */
export const AUTH_SESSION = new InjectionToken<WritableSignal<AuthSession | null>>("AUTH_SESSION", {
  providedIn: "root",
  factory: () => signal<AuthSession | null>(null),
});

type AuthSession = Pick<AuthService, "isLoggedIn" | "idToken">;

const isBackendUrl = (url: string) =>
  url.startsWith(environment.backendGraphqlUrl) || url.startsWith(environment.backendUrl);

/**
 * Adds the signed-in viewer's Firebase ID token as `firebase-auth-key` to every request for the
 * backend, unless the request carries {@link ANONYMOUS}. A signed-out viewer's request goes out at
 * once and unchanged. The token is asked for when the request is sent (synchronously, so a request
 * made just before a sign-out still carries the old session's token), and a failed token refresh
 * fails the request with Firebase's error before anything is sent.
 *
 * A request that carries the token skips the SSR transfer cache (`transferCache: false`): the cache
 * keys on method, URL and body, not headers, and until the app first settles it would answer a
 * signed-in viewer with the server's anonymous answer to the same query (`isMine`, `userVote`).
 * This interceptor runs before Angular's transfer-cache interceptor, which reads that flag.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const session = inject(AUTH_SESSION)();
  if (!session?.isLoggedIn() || req.context.get(ANONYMOUS) || !isBackendUrl(req.url)) {
    return next(req);
  }
  return from(session.idToken()).pipe(
    switchMap((token) =>
      next(token ? req.clone({ setHeaders: { [AUTH_HEADER]: token }, transferCache: false }) : req),
    ),
  );
};
